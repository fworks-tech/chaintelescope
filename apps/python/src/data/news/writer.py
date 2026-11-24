"""Scheduled-job writer: RSS ``FeedItem`` rows into ``news_items`` (idempotent).

Runs on ECS (EventBridge Scheduler), inside the VPC so it reaches the
RDS instance. Never migrates schema — it only ``INSERT``\ s with
``ON CONFLICT (content_hash) DO NOTHING``, the same rule as the Node
``ingestNewsItem`` path, so reruns and overlapping writers stay safe.

``content_hash`` replicates the Node canonical pre-image byte-for-byte:
``{"publishedAt","title","url"}`` with sorted keys and compact separators
(see ADR-0010). A pinned vector test guards the rule on this side.
"""

import hashlib
import json
import os
import sys

from loguru import logger
from src.data.news.ingestion import load_news_items
from src.data.news.models import FeedItem

INSERT_SQL = """
INSERT INTO news_items (title, url, source, tags, published_at, content_hash, canonical_payload)
VALUES (%s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (content_hash) DO NOTHING
RETURNING id
"""


def canonical_payload(item: FeedItem) -> str:
    """Canonical pre-image: sorted keys, compact separators, no ASCII escape.

    Mirrors ``packages/shared`` ``canonicalize`` (``JSON.stringify`` never
    escapes non-ASCII except U+2028/U+2029 — vanishingly rare in headlines,
    accepted gap documented in ADR-0010).

    Cross-writer rule: ``published_at`` is always UTC ``+00:00`` ISO here;
    any future writer must emit the same lexical form or `content_hash`
    will never collide (vector test pins this side).
    """
    return json.dumps(
        {
            "publishedAt": item.published_at.isoformat(),
            "title": item.title,
            "url": item.url,
        },
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )


def content_hash(canonical: str) -> str:
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def is_http_url(url: str) -> bool:
    return url.startswith("http://") or url.startswith("https://")


def open_conn():
    """Write connection. Full ``DATABASE_URL`` wins; otherwise PG parts as
    keyword args (never interpolated into a string — conninfo injection),
    with ``sslmode=require`` like the Node ``resolvePgSsl`` path.
    """
    import psycopg

    full = os.getenv("DATABASE_URL", "").strip()
    if full:
        return psycopg.connect(full)
    return psycopg.connect(
        host=os.getenv("PGHOST", "localhost"),
        port=int(os.getenv("PGPORT", "5432")),
        dbname=os.getenv("PGDATABASE", "chaintelescope"),
        user=os.getenv("PGUSER", "postgres"),
        password=os.getenv("PGPASSWORD", ""),
        sslmode="require",
    )


def write_news_items(conn, items: list[FeedItem]) -> dict:
    """Insert items, counting created vs deduped rows. One feed failing
    upstream never reaches here — ``load_news_items`` already isolates
    per-feed failures and falls back, so this stays a straight loop.
    A mid-loop DB error propagates and the transaction rolls back whole.
    """
    if not items:
        return {"created": 0, "deduped": 0}
    created = 0
    deduped = 0
    with conn.cursor() as cur:
        for item in items:
            canonical = canonical_payload(item)
            cur.execute(
                INSERT_SQL,
                (
                    item.title,
                    item.url,
                    item.source,
                    [tag.lower() for tag in item.tags],
                    item.published_at,
                    content_hash(canonical),
                    canonical,
                ),
            )
            if cur.fetchone():
                created += 1
            else:
                deduped += 1
    conn.commit()
    return {"created": created, "deduped": deduped}


def main() -> dict:
    """Entry point for the scheduled task: fetch everything, store all.

    No watchlist filter here — filtering happens at read time
    (``GET /api/news``), so one run serves every watchlist.
    Mock fallback rows are never persisted: if every feed failed, raise so
    the failure pages instead of polluting the table with ``example.com``.
    Non-http(s) URLs are skipped (stored XSS otherwise, see web audit).
    """
    fetched = load_news_items()
    items = [item for item in fetched if item.source != "mock" and is_http_url(item.url)]
    skipped = len(fetched) - len(items)
    if skipped:
        logger.warning("skipping {} non-persistable items", skipped)
    if not items:
        raise RuntimeError(
            "all feeds failed; refusing to persist fallback rows",
        )
    with open_conn() as conn:
        result = write_news_items(conn, items)
    result["fetched"] = len(items)
    return result


if __name__ == "__main__":
    outcome = main()
    print(json.dumps(outcome, sort_keys=True))
    sys.exit(0)
