import unittest
from datetime import datetime
from unittest.mock import patch

from src.views import cached_dashboard_snapshot


class CachingTests(unittest.TestCase):
    @patch("src.data.market.service.fetch_ccxt_series")
    @patch("src.data.news.ingestion._parse_feed", return_value=[])
    def test_snapshot_cached_returns_consistent_data(self, _mock_news, mock_fetch):
        mock_fetch.return_value = (
            [datetime(2024, 5, 14)],
            [100.0],
            "binance",
        )
        snap1 = cached_dashboard_snapshot("30D", ["BTC"], market_source="binance")
        snap2 = cached_dashboard_snapshot("30D", ["BTC"], market_source="binance")
        self.assertEqual(snap1.primary_asset, snap2.primary_asset)
        self.assertEqual(snap1.price_values, snap2.price_values)

    @patch("src.data.market.service.fetch_ccxt_series")
    @patch("src.data.news.ingestion._parse_feed", return_value=[])
    def test_different_time_window_produces_different_snapshot(self, _mock_news, mock_fetch):
        mock_fetch.side_effect = [
            ([datetime(2024, 5, 14)], [100.0], "binance"),
            ([datetime(2024, 5, 14)], [200.0], "binance"),
        ]
        snap1 = cached_dashboard_snapshot("90D", ["BTC"], market_source="binance")
        snap2 = cached_dashboard_snapshot("24H", ["BTC"], market_source="binance")
        self.assertEqual(snap1.primary_asset, snap2.primary_asset)
        self.assertNotEqual(snap1.time_window, snap2.time_window)


if __name__ == "__main__":
    unittest.main()
