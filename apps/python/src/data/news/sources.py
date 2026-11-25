"""Rights-gated news sources loaded from the generated shared registry."""

import json
from datetime import UTC, date, datetime
from pathlib import Path

_REGISTRY_PATH = Path(__file__).with_name("sources.generated.json")

with open(_REGISTRY_PATH, encoding="utf-8") as _fh:
    _REGISTRY = json.load(_fh)

NEWS_SOURCES = tuple(_REGISTRY["sources"])


def _is_current(source: dict, today: date) -> bool:
    reviewed_at = date.fromisoformat(source["reviewedAt"])
    review_expires_at = date.fromisoformat(source["reviewExpiresAt"])
    return reviewed_at <= today < review_expires_at


def approved_automation_sources(today: date | None = None) -> tuple[dict, ...]:
    """Return only enabled sources whose rights review is still valid."""
    reference = today or datetime.now(UTC).date()
    return tuple(
        source
        for source in NEWS_SOURCES
        if source["enabled"]
        and source["automationRights"] == "approved"
        and source["metadataRights"] == "approved"
        and _is_current(source, reference)
    )


def rss_feed_urls(today: date | None = None) -> tuple[str, ...]:
    """Feed URLs supported by the current XML parser; never env-overridable."""
    return tuple(
        source["feedUrl"]
        for source in approved_automation_sources(today)
        if source["adapter"] in {"rss", "atom"}
    )


def poll_interval_minutes(feed_url: str) -> int:
    """Cadence for a registered feed; unknown URLs use the conservative default."""
    return next(
        (source["pollIntervalMinutes"] for source in NEWS_SOURCES if source["feedUrl"] == feed_url),
        60,
    )
