import unittest
from unittest.mock import patch

import ccxt
from src.data.market import service as market_service
from src.data.market.service import fetch_price_trend
from src.data.news import ingestion as news_ingestion
from src.data.news.ingestion import load_news_items


class LoggingTests(unittest.TestCase):
    @patch.object(market_service.logger, "warning")
    @patch(
        "src.data.market.service.fetch_ccxt_series",
        side_effect=ccxt.NetworkError("api down"),
    )
    def test_logger_warning_on_all_providers_fail(self, mock_ccxt, mock_logger):
        fetch_price_trend("BTC", 30, "30D")
        self.assertGreaterEqual(mock_logger.call_count, 1)

    @patch.object(news_ingestion.logger, "warning")
    @patch("src.data.news.ingestion._feed_urls", return_value=["https://example.com/feed"])
    @patch("src.data.news.ingestion._parse_feed", side_effect=Exception("feed failed"))
    def test_logger_warning_on_news_feed_failure(self, _mock_parse, _mock_urls, mock_logger):
        load_news_items()
        mock_logger.assert_called_once()


if __name__ == "__main__":
    unittest.main()
