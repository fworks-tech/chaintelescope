import unittest
from unittest.mock import MagicMock, patch

import ccxt
from src.data.market.ccxt_adapter import fetch_ccxt_series


def _mock_ohlcv():
    return [[1715683200000, 100.0, 101.0, 99.0, 100.5, 1000.0]]


class RetryTests(unittest.TestCase):
    @patch("src.data.market.ccxt_adapter.ccxt.binance")
    def test_fetch_ccxt_retries_on_failure(self, mock_exchange_class):
        mock_exchange = MagicMock()
        mock_exchange_class.return_value = mock_exchange
        mock_exchange.fetch_ohlcv.side_effect = [
            ccxt.NetworkError("timeout"),
            ccxt.NetworkError("timeout"),
            _mock_ohlcv(),
        ]
        result = fetch_ccxt_series("binance", "BTC", 30)
        self.assertIsNotNone(result)
        self.assertEqual(mock_exchange.fetch_ohlcv.call_count, 3)

    @patch("src.data.market.ccxt_adapter.ccxt.binance")
    def test_fetch_ccxt_unknown_exchange_returns_none(self, _mock_exchange):
        result = fetch_ccxt_series("nonexistent", "BTC", 30)
        self.assertIsNone(result)

    @patch("src.data.market.ccxt_adapter.ccxt.coinbase")
    def test_fetch_ccxt_returns_correct_shape(self, mock_exchange_class):
        mock_exchange = MagicMock()
        mock_exchange_class.return_value = mock_exchange
        mock_exchange.fetch_ohlcv.return_value = _mock_ohlcv()
        dates, prices, source = fetch_ccxt_series("coinbase", "BTC", 30)
        self.assertEqual(len(dates), 1)
        self.assertEqual(len(prices), 1)
        self.assertEqual(source, "coinbase")


if __name__ == "__main__":
    unittest.main()
