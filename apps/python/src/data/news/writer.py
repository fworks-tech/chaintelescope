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

from src.data.news.ingestion import load_news_items
from src.data.news.models import FeedItem

INSERT_SQL = """
INSERT INTO news_items (title, url, published_at, content_hash, canonical_payload)
VALUES (%s, %s, %s, %s, %s)
ON CONFLICT (content_hash) DO NOTHING
RETURNING id
"""


def canonical_payload(item: FeedItem) -> str:
    """Canonical pre-image: sorted keys, compact separators, no ASCII escape.

    Mirrors ``packages/shared`` ``canonicalize`` (``JSON.stringify`` never
    escapes non-ASCII except U+2028/U+2029 — vanishingly rare in headlines,
    accepted gap documented in ADR-0010).
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


def build_dsn() -> str:
    """Full ``DATABASE_URL`` wins; otherwise assemble from PG parts.

    Mirrors the Node ``DATABASE_URL``-or-parts boot rule (``env.ts``).
    """
    full = os.getenv("DATABASE_URL", "").strip()
    if full:
        return full
    parts = {
        "host": os.getenv("PGHOST", "localhost"),
        "port": os.getenv("PGPORT", "5432"),
        "dbname": os.getenv("PGDATABASE", "chaintelescope"),
        "user": os.getenv("PGUSER", "postgres"),
        "password": os.getenv("PGPASSWORD", ""),
    }
    return " ".join(f"{key}={value}" for key, value in parts.items())


def write_news_items(conn, items: list[FeedItem]) -> dict:
    """Insert items, counting created vs deduped rows. One feed failing
    upstream never reaches here — ``load_news_items`` already isolates
    per-feed failures and falls back, so this stays a straight loop."""
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
    """
    import psycopg

    items = load_news_items()
    with psycopg.connect(build_dsn()) as conn:
        result = write_news_items(conn, items)
    result["fetched"] = len(items)
    return result


if __name__ == "__main__":
    import sys

    outcome = main()
    print(json.dumps(outcome, sort_keys=True))
    sys.exit(0)
