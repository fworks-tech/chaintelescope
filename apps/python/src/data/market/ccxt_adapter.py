import datetime

import ccxt
from tenacity import retry, stop_after_attempt, wait_exponential

EXCHANGE_NAMES = ("binance", "coingecko", "coinbase")


def _build_symbol(asset: str, exchange_name: str) -> str:
    if exchange_name == "coinbase":
        return f"{asset}/USD"
    return f"{asset}/USDT"


def _build_exchange(exchange_name: str):
    exchange_class = getattr(ccxt, exchange_name, None)
    if exchange_class is None:
        return None
    return exchange_class({"enableRateLimit": True})


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
def fetch_ccxt_series(exchange_name: str, asset: str, days: int):
    if exchange_name not in EXCHANGE_NAMES:
        return None

    exchange = _build_exchange(exchange_name)
    if exchange is None:
        return None

    symbol = _build_symbol(asset, exchange_name)
    timeframe = "1d" if days > 1 else "1h"
    limit = max(days, 1)

    ohlcv = exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
    if not ohlcv:
        return None

    dates = [datetime.datetime.fromtimestamp(row[0] / 1000) for row in ohlcv]
    prices = [float(row[4]) for row in ohlcv]
    return dates, prices, exchange_name
