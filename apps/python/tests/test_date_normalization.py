"""Date normalization parity: mirror the Node chain validation (#178)."""

import unittest
from unittest.mock import patch

from src.data.market import service as market_service


class DateNormalizationTests(unittest.TestCase):
    def setUp(self):
        market_service._CACHE.clear()

    def tearDown(self):
        market_service._CACHE.clear()

    def test_invalid_dates_raise(self):
        with self.assertRaises(ValueError):
            market_service._normalize_dates(["not-a-date"])

    def test_invalid_provider_dates_fall_through_to_mock(self):
        with (
            patch("src.data.market.service._ccxt_available", return_value=True),
            patch(
                "src.data.market.service.fetch_ccxt_series",
                return_value=(["not-a-date"], [1.0], "binance"),
            ),
        ):
            _, _, _, source = market_service.fetch_price_trend(
                "BTC", 30, "30D", market_source="binance"
            )
            self.assertEqual(source, "mock")

    def test_nan_timestamp_rejected(self):
        # pandas turns NaN into NaT, which claims isinstance(datetime);
        # both runtimes must reject it (parity with the Node chain).
        with self.assertRaises(ValueError):
            market_service._normalize_dates([float("nan")])

    def test_valid_dates_pass_through(self):
        dates = market_service._normalize_dates(["2024-05-14T00:00:00.000Z", 1715644800000])
        self.assertEqual(len(dates), 2)
        self.assertNotIn("not-a-date", [str(d) for d in dates])


if __name__ == "__main__":
    unittest.main()
