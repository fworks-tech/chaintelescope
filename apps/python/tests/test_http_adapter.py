import unittest
from datetime import datetime
from unittest.mock import patch

import httpx
from src.data.market import service as market_service
from src.data.market.http_adapter import fetch_http_series


def _transport(handler):
    return httpx.MockTransport(handler)


def _binance_ok(request):
    assert request.url.host == "api.binance.com"
    payload = [
        [1715731200000, "64000.0", "64500.0", "63900.0", "64200.0", "100.0", 1715817599999],
        [1715817600000, "64200.0", "64800.0", "64100.0", "64600.0", "110.0", 1715903999999],
    ]
    return httpx.Response(200, json=payload)


def _coingecko_ok(request):
    assert "coingecko.com" in request.url.host
    assert request.url.params["vs_currency"] == "usd"
    return httpx.Response(
        200,
        json={"prices": [[1715731200000, 64000.0], [1715817600000, 64500.0]]},
    )


def _coinbase_descending(request):
    assert "coinbase.com" in request.url.host
    newest_first = [
        [1715904000, 64000.0, 65000.0, 64100.0, 64600.0, 90.0],
        [1715817600, 63800.0, 64400.0, 63900.0, 64200.0, 80.0],
        [1715731200, 63500.0, 64000.0, 63600.0, 63900.0, 70.0],
    ]
    return httpx.Response(200, json=newest_first)


def _rate_limited(request):
    return httpx.Response(429, json={"error": "slow down"})


class HttpAdapterTests(unittest.TestCase):
    def test_binance_parses_klines(self):
        dates, prices, source = fetch_http_series(
            "binance", "BTC", 2, transport=_transport(_binance_ok)
        )
        self.assertEqual(source, "binance")
        self.assertEqual(prices, [64200.0, 64600.0])
        self.assertTrue(all(isinstance(d, datetime) for d in dates))
        self.assertLess(dates[0], dates[1])

    def test_coingecko_parses_market_chart(self):
        dates, prices, source = fetch_http_series(
            "coingecko", "BTC", 2, transport=_transport(_coingecko_ok)
        )
        self.assertEqual(source, "coingecko")
        self.assertEqual(prices, [64000.0, 64500.0])
        self.assertLess(dates[0], dates[1])

    def test_coinbase_sorts_descending_candles_and_slices(self):
        dates, prices, source = fetch_http_series(
            "coinbase", "BTC", 2, transport=_transport(_coinbase_descending)
        )
        self.assertEqual(source, "coinbase")
        self.assertEqual(prices, [64200.0, 64600.0])
        self.assertLess(dates[0], dates[1])

    def test_rate_limit_returns_none(self):
        self.assertIsNone(
            fetch_http_series("binance", "BTC", 2, transport=_transport(_rate_limited))
        )

    def test_unknown_provider_returns_none(self):
        self.assertIsNone(fetch_http_series("kraken", "BTC", 2))

    def test_unknown_asset_returns_none(self):
        self.assertIsNone(
            fetch_http_series("coingecko", "ZZZ", 2, transport=_transport(_coingecko_ok))
        )


class SlimEnvServiceTests(unittest.TestCase):
    def setUp(self):
        market_service._CACHE.clear()

    def tearDown(self):
        market_service._CACHE.clear()

    @patch("src.data.market.service._ccxt_available", return_value=False)
    @patch("src.data.market.service.fetch_http_series")
    def test_no_ccxt_uses_http_not_mock(self, mock_http, _mock_no_ccxt):
        mock_http.return_value = ([datetime(2024, 5, 14)], [100.0], "coingecko")
        _, _, _, source = market_service.fetch_price_trend("BTC", 30, "30D")
        self.assertEqual(source, "coingecko")

    @patch("src.data.market.service._ccxt_available", return_value=False)
    @patch("src.data.market.service.fetch_http_series")
    def test_successful_fetch_is_cached(self, mock_http, _mock_no_ccxt):
        mock_http.return_value = ([datetime(2024, 5, 14)], [100.0], "binance")
        market_service.fetch_price_trend("BTC", 7, "7D")
        market_service.fetch_price_trend("BTC", 7, "7D")
        self.assertEqual(mock_http.call_count, 1)


if __name__ == "__main__":
    unittest.main()
