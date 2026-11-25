import email.utils
import hashlib
import time
import xml.etree.ElementTree as ET
from datetime import UTC, datetime
from threading import Lock

import httpx
from defusedxml.ElementTree import fromstring as safe_fromstring
from dotenv import load_dotenv
from loguru import logger
from src.data.mock_market import news_snapshot
from src.data.news.models import FeedItem
from src.data.news.sources import poll_interval_minutes, rss_feed_urls

ATOM_NS = "http://www.w3.org/2005/Atom"

# Feeds are ~100 KB; anything 50x that is abuse, not news (the 512 MiB
# Fargate task parses before the 20-item cap applies).
MAX_FEED_BYTES = 5_000_000

load_dotenv()

FALLBACK_ITEMS = [
    FeedItem(
        id="fallback-etf",
        source="mock",
        published_at=datetime.now(UTC),
        title="ETF flows rebound",
        url="https://example.com/etf-flows",
        tags=["BTC", "ETF"],
    ),
    FeedItem(
        id="fallback-sol",
        source="mock",
        published_at=datetime.now(UTC),
        title="Layer-1 activity rotates to SOL",
        url="https://example.com/sol-activity",
        tags=["SOL"],
    ),
    FeedItem(
        id="fallback-reserves",
        source="mock",
        published_at=datetime.now(UTC),
        title="Exchange reserves decline",
        url="https://example.com/exchange-reserves",
        tags=["BTC", "ETH"],
    ),
]


def _feed_urls():
    return list(rss_feed_urls())


def _item_id(source: str, title: str, url: str) -> str:
    digest = hashlib.sha256(f"{source}|{title}|{url}".encode()).hexdigest()
    return digest[:16]


def _parse_date(date_str: str, is_atom: bool) -> datetime:
    if not date_str:
        return datetime.now(UTC)
    try:
        if is_atom:
            parsed = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        else:
            parsed = email.utils.parsedate_to_datetime(date_str)
    except (ValueError, TypeError):
        return datetime.now(UTC)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _parse_atom_entry(entry: ET.Element, source: str) -> FeedItem | None:
    title_el = entry.find(f"{{{ATOM_NS}}}title")
    title = title_el.text.strip() if title_el is not None and title_el.text else ""
    if not title:
        return None
    link_el = entry.find(f"{{{ATOM_NS}}}link")
    link = (link_el.get("href") or "").strip() if link_el is not None else ""
    pub_str = (
        entry.findtext(f"{{{ATOM_NS}}}published") or entry.findtext(f"{{{ATOM_NS}}}updated") or ""
    )
    tag_els = entry.findall(f"{{{ATOM_NS}}}category")
    tags = [tag.get("term", "") for tag in tag_els if tag.get("term")]
    return FeedItem(
        id=_item_id(source, title, link or title),
        source=source,
        published_at=_parse_date(pub_str, is_atom=True),
        title=title,
        url=link or source,
        tags=tags,
    )


def _parse_rss_entry(entry: ET.Element, source: str) -> FeedItem | None:
    title = (entry.findtext("title") or "").strip()
    if not title:
        return None
    link = (entry.findtext("link") or "").strip()
    pub_str = entry.findtext("pubDate") or ""
    tag_els = entry.findall("category")
    tags = [tag.text for tag in tag_els if tag.text]
    return FeedItem(
        id=_item_id(source, title, link or title),
        source=source,
        published_at=_parse_date(pub_str, is_atom=False),
        title=title,
        url=link or source,
        tags=tags,
    )


def _parse_feed(url: str) -> list[FeedItem]:
    resp = httpx.get(url, timeout=10, follow_redirects=True)
    resp.raise_for_status()
    if len(resp.content) > MAX_FEED_BYTES:
        raise ValueError(f"feed exceeds {MAX_FEED_BYTES} bytes: {url}")
    # defusedxml: feeds are untrusted XML, entity expansion is a DoS vector.
    root = safe_fromstring(resp.content)

    is_atom = root.tag == f"{{{ATOM_NS}}}feed"

    if is_atom:
        entries = root.findall(f"{{{ATOM_NS}}}entry")[:20]
    else:
        entries = root.findall(".//item")[:20]

    parser = _parse_atom_entry if is_atom else _parse_rss_entry
    return [item for entry in entries if (item := parser(entry, url)) is not None]


_FEED_CACHE: dict[str, tuple[float, list[FeedItem]]] = {}
_FEED_FAILURES: dict[str, float] = {}
_FEED_LOCKS: dict[str, Lock] = {}
_FEED_LOCKS_GUARD = Lock()
_FEED_FAILURE_BACKOFF_SECONDS = 300


def _feed_lock(url: str) -> Lock:
    with _FEED_LOCKS_GUARD:
        return _FEED_LOCKS.setdefault(url, Lock())


def _cached_parse_feed(url: str) -> list[FeedItem]:
    with _feed_lock(url):
        now = time.monotonic()
        cached = _FEED_CACHE.get(url)
        if cached is not None and now - cached[0] < poll_interval_minutes(url) * 60:
            return cached[1]
        failed_at = _FEED_FAILURES.get(url)
        if failed_at is not None and now - failed_at < _FEED_FAILURE_BACKOFF_SECONDS:
            return cached[1] if cached is not None else []
        try:
            items = _parse_feed(url)
        except Exception:
            _FEED_FAILURES[url] = now
            raise
        _FEED_FAILURES.pop(url, None)
        _FEED_CACHE[url] = (now, items)
        return items


def _dedupe_items(items: list[FeedItem]) -> list[FeedItem]:
    seen = set()
    deduped = []
    for item in items:
        key = (item.title.lower(), item.url)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _filter_by_watchlist(items: list[FeedItem], watchlist: list[str] | None) -> list[FeedItem]:
    if not watchlist:
        return items
    lowered = [asset.lower() for asset in watchlist]
    filtered = [
        item
        for item in items
        if any(
            asset in item.title.lower() or asset in [tag.lower() for tag in item.tags]
            for asset in lowered
        )
    ]
    return filtered or items


def load_news_items(watchlist: list[str] | None = None) -> list[FeedItem]:
    collected: list[FeedItem] = []
    for url in _feed_urls():
        try:
            collected.extend(_cached_parse_feed(url))
        except Exception as exc:
            logger.warning("Feed parse failed for {}: {}", url, exc)
            continue

    if not collected:
        collected = FALLBACK_ITEMS.copy()
        if watchlist:
            filtered = _filter_by_watchlist(collected, watchlist)
            if filtered:
                collected = filtered
        return _dedupe_items(collected)

    collected = _dedupe_items(collected)
    collected = _filter_by_watchlist(collected, watchlist)
    if not collected:
        collected = [
            FeedItem(
                id=_item_id("mock", line, line),
                source="mock",
                published_at=datetime.now(UTC),
                title=line,
                url="https://example.com/news",
                tags=watchlist or [],
            )
            for line in news_snapshot()
        ]
    return collected
