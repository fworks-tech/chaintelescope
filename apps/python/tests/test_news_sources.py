import unittest
from datetime import date
from threading import Event, Thread
from unittest.mock import patch

from src.data.news.ingestion import (
    _FEED_CACHE,
    _FEED_FAILURES,
    _cached_parse_feed,
    _feed_urls,
    load_news_items,
)
from src.data.news.sources import (
    NEWS_SOURCES,
    approved_automation_sources,
    rss_feed_urls,
)

TODAY = date(2026, 11, 24)
SEC_FEED = "https://www.sec.gov/news/pressreleases.rss"
COINTELEGRAPH_FEED = "https://cointelegraph.com/rss"
COINDESK_FEED = "https://www.coindesk.com/arc/outboundfeeds/rss/"


class NewsSourceRegistryTests(unittest.TestCase):
    def setUp(self):
        _FEED_CACHE.clear()
        _FEED_FAILURES.clear()

    def test_keys_and_feed_urls_are_unique(self):
        keys = [source["key"] for source in NEWS_SOURCES]
        urls = [source["feedUrl"] for source in NEWS_SOURCES]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertEqual(len(urls), len(set(urls)))

    def test_enabled_sources_have_approved_rights(self):
        enabled = [source for source in NEWS_SOURCES if source["enabled"]]
        self.assertTrue(enabled)
        for source in enabled:
            self.assertEqual(source["automationRights"], "approved", source["key"])
            self.assertEqual(source["metadataRights"], "approved", source["key"])

    def test_denied_sources_are_disabled(self):
        cointelegraph = next(source for source in NEWS_SOURCES if source["key"] == "cointelegraph")
        self.assertFalse(cointelegraph["enabled"])
        self.assertEqual(cointelegraph["automationRights"], "denied")
        self.assertEqual(cointelegraph["metadataRights"], "denied")

    def test_rss_urls_exclude_denied_and_pending_sources(self):
        urls = rss_feed_urls(TODAY)
        self.assertIn(SEC_FEED, urls)
        self.assertNotIn(COINTELEGRAPH_FEED, urls)
        self.assertNotIn(COINDESK_FEED, urls)

    def test_environment_override_cannot_enable_denied_source(self):
        baseline = rss_feed_urls(TODAY)
        with patch.dict("os.environ", {"NEWS_FEED_URLS": COINTELEGRAPH_FEED}):
            self.assertEqual(rss_feed_urls(TODAY), baseline)

    @patch("src.data.news.ingestion._parse_feed", return_value=[])
    def test_ingestion_uses_only_the_approved_sec_feed(self, mock_parse):
        with patch.dict("os.environ", {"NEWS_FEED_URLS": COINTELEGRAPH_FEED}):
            self.assertEqual(_feed_urls(), [SEC_FEED])
            load_news_items()
        mock_parse.assert_called_once_with(SEC_FEED)

    @patch("src.data.news.ingestion.time.monotonic", side_effect=[0, 1, 3601])
    @patch("src.data.news.ingestion._parse_feed", return_value=[])
    def test_feed_cache_respects_the_source_polling_interval(self, mock_parse, _mock_time):
        _cached_parse_feed(SEC_FEED)
        _cached_parse_feed(SEC_FEED)
        _cached_parse_feed(SEC_FEED)
        self.assertEqual(mock_parse.call_count, 2)

    def test_expired_source_is_not_returned(self):
        expired = dict(NEWS_SOURCES[0], reviewExpiresAt="2026-11-23")
        with patch("src.data.news.sources.NEWS_SOURCES", (expired,)):
            self.assertEqual(approved_automation_sources(TODAY), ())

    def test_review_expiry_is_exclusive(self):
        expiring = dict(NEWS_SOURCES[0], reviewExpiresAt="2026-11-24")
        with patch("src.data.news.sources.NEWS_SOURCES", (expiring,)):
            self.assertEqual(approved_automation_sources(TODAY), ())

    @patch("src.data.news.ingestion.time.monotonic", return_value=0)
    @patch("src.data.news.ingestion._parse_feed", side_effect=RuntimeError("down"))
    def test_feed_failures_are_backed_off(self, mock_parse, _mock_time):
        with self.assertRaises(RuntimeError):
            _cached_parse_feed(SEC_FEED)
        self.assertEqual(_cached_parse_feed(SEC_FEED), [])
        self.assertEqual(mock_parse.call_count, 1)

    def test_feed_failures_serve_stale_cache_during_backoff(self):
        stale = [object()]
        _FEED_CACHE[SEC_FEED] = (0, stale)
        with (
            patch("src.data.news.ingestion.time.monotonic", side_effect=[3601, 3602]),
            patch("src.data.news.ingestion._parse_feed", side_effect=RuntimeError("down")),
        ):
            with self.assertRaises(RuntimeError):
                _cached_parse_feed(SEC_FEED)
            self.assertEqual(_cached_parse_feed(SEC_FEED), stale)

    def test_concurrent_misses_share_one_fetch(self):
        started = Event()
        release = Event()
        results: list[list] = []

        def slow_parse(_url):
            started.set()
            if not release.wait(timeout=2):
                raise RuntimeError("test parser was not released")
            return []

        def load():
            results.append(_cached_parse_feed(SEC_FEED))

        with patch("src.data.news.ingestion._parse_feed", side_effect=slow_parse) as mock_parse:
            first = Thread(target=load)
            second = Thread(target=load)
            first.start()
            self.assertTrue(started.wait(timeout=1))
            second.start()
            release.set()
            first.join(timeout=2)
            second.join(timeout=2)

        self.assertEqual(mock_parse.call_count, 1)
        self.assertEqual(results, [[], []])

    def test_future_review_is_not_returned(self):
        future = dict(NEWS_SOURCES[0], reviewedAt="2026-11-25")
        with patch("src.data.news.sources.NEWS_SOURCES", (future,)):
            self.assertEqual(approved_automation_sources(TODAY), ())


if __name__ == "__main__":
    unittest.main()
