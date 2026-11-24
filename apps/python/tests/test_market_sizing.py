"""Days vs window semantics: window is the source of truth (#175).

Days stays as legacy query compat and only sizes the series when the
window is unknown.
"""

import unittest
from unittest.mock import patch

from src.data.market import service as market_service


class MarketSizingTests(unittest.TestCase):
    def setUp(self):
        market_service._CACHE.clear()

    def tearDown(self):
        market_service._CACHE.clear()

    def test_window_wins_for_mock_source(self):
        _, prices, _, _ = market_service.fetch_price_trend("BTC", 999, "7D", market_source="mock")
        self.assertEqual(len(prices), 7)
        _, prices, _, _ = market_service.fetch_price_trend("BTC", 1, "30D", market_source="mock")
        self.assertEqual(len(prices), 30)

    def test_live_path_is_sized_by_window(self):
        with (
            patch("src.data.market.service._ccxt_available", return_value=True),
            patch("src.data.market.service.fetch_ccxt_series", return_value=None) as mock_ccxt,
        ):
            market_service.fetch_price_trend("BTC", 999, "7D")
            mock_ccxt.assert_any_call("binance", "BTC", 7)
            for call in mock_ccxt.call_args_list:
                self.assertEqual(call.args[2], 7)

    def test_unknown_window_falls_back_to_days(self):
        _, prices, _, source = market_service.fetch_price_trend(
            "BTC", 5, "9D", market_source="mock"
        )
        self.assertEqual(len(prices), 5)
        self.assertEqual(source, "mock")


if __name__ == "__main__":
    unittest.main()
