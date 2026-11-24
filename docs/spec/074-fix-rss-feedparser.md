# Spec: Replace feedparser with httpx + xml.etree.ElementTree

## Problem

`feedparser 6.x` dropped the `sgmllib` copy it used to vendor, so on Python 3 it needs the third-party `sgmllib3k` port (the stdlib `sgmllib` module is gone since Python 3.0). The import fails silently — the app falls back to 3 hardcoded mock items.

## Proposed Solution

Replace `feedparser.parse()` with `httpx.get()` (already a dependency) + stdlib `xml.etree.ElementTree`. Support both RSS 2.0 and Atom feeds. Remove `feedparser` from `requirements.txt`.

## Out of Scope

- Async/concurrent fetching (would require refactoring the sync `load_news_items` caller)
- NewsAPI fallback (tracked in #16)
- Feed validation or schema enforcement beyond basic parsing

## Acceptance Criteria

- [x] `feedparser` removed from `requirements.txt`; no new dependencies added
- [x] `_parse_feed()` parses RSS 2.0 feeds (title, link, pubDate, category tags)
- [x] `_parse_feed()` parses Atom feeds (title, link, published/updated, category tags)
- [x] Fallback to mock items still works when all feeds fail
- [x] All existing tests pass without modification
- [x] Documentation references to `feedparser` updated

## Testing Strategy

Existing tests mock `_parse_feed` directly and should pass unchanged. Run full suite with `python -m unittest discover -s tests -p 'test_*.py' -v`.

## Open Questions

None.
