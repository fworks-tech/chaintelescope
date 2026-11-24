"""httpx-based market fetchers: the dependency-light path for the slim serverless env.

Mirrors the venue URLs and parsing in `apps/api/src/market/providers/*.ts`
so both stacks read the same shapes. Every entry returns
`(dates, prices, provider)` or `None` on any failure; the service falls
through to the next provider and finally to mock. Never raises.
"""

import datetime

import httpx
from loguru import logger
from src.data.assets import BINANCE_SYMBOLS, COINBASE_PRODUCTS, COINGECKO_IDS
from src.data.market.config import load_market_config


def _timeout_seconds() -> float:
    try:
        return load_market_config().request_timeout_seconds
    except Exception:
        return 10.0


_CLIENT: httpx.Client | None = None


def _get(url: str, params: dict, transport=None):
    # One client per process: keeps connections alive across polls. Tests pass
    # their own transport, which always gets a throwaway client instead.
    if transport is not None:
        with httpx.Client(timeout=_timeout_seconds(), transport=transport) as client:
            response = client.get(url, params=params, headers={"accept": "application/json"})
    else:
        global _CLIENT
        if _CLIENT is None:
            _CLIENT = httpx.Client(timeout=_timeout_seconds())
        response = _CLIENT.get(url, params=params, headers={"accept": "application/json"})
    if response.status_code != 200:
        raise ValueError(f"HTTP {response.status_code} for {url}")
    return response.json()


def fetch_http_series(provider: str, asset: str, days: int, transport=None):
    """Fetch one venue without ccxt. Returns `(dates, prices, provider) | None`."""
    try:
        if provider == "binance":
            return _binance_series(asset, days, transport)
        if provider == "coingecko":
            return _coingecko_series(asset, days, transport)
        if provider == "coinbase":
            return _coinbase_series(asset, days, transport)
        return None
    except Exception as exc:
        logger.warning("HTTP provider {} failed for {}: {}", provider, asset, exc)
        return None


def _binance_series(asset: str, days: int, transport):
    symbol = BINANCE_SYMBOLS.get(asset.upper(), f"{asset.upper()}USDT")
    payload = _get(
        "https://api.binance.com/api/v3/klines",
        {
            "symbol": symbol,
            "interval": "1d" if days > 1 else "1h",
            "limit": str(max(days, 1)),
        },
        transport,
    )
    dates, prices = [], []
    for row in payload if isinstance(payload, list) else []:
        if not isinstance(row, list) or len(row) < 5:
            continue
        dates.append(datetime.datetime.fromtimestamp(float(row[0]) / 1000))
        prices.append(float(row[4]))
    if not prices:
        return None
    return dates, prices, "binance"


def _coingecko_series(asset: str, days: int, transport):
    coin_id = COINGECKO_IDS.get(asset.upper())
    if coin_id is None:
        return None
    payload = _get(
        f"https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart",
        {"vs_currency": "usd", "days": str(max(days, 1)), "interval": "daily"},
        transport,
    )
    points = payload.get("prices", []) if isinstance(payload, dict) else []
    dates, prices = [], []
    for point in points:
        if not isinstance(point, list) or len(point) < 2:
            continue
        dates.append(datetime.datetime.fromtimestamp(float(point[0]) / 1000))
        prices.append(float(point[1]))
    if not prices:
        return None
    return dates, prices, "coingecko"


def _coinbase_series(asset: str, days: int, transport):
    product = COINBASE_PRODUCTS.get(asset.upper())
    if product is None:
        return None
    payload = _get(
        f"https://api.exchange.coinbase.com/products/{product}/candles",
        {"granularity": "86400" if days > 1 else "3600"},
        transport,
    )
    candles = []
    for row in payload if isinstance(payload, list) else []:
        if not isinstance(row, list) or len(row) < 5:
            continue
        candles.append((float(row[0]) * 1000, float(row[4])))
    candles.sort()
    # Venue returns newest-first: keep the latest N in chronological order.
    candles = candles[-max(days, 1) :]
    if not candles:
        return None
    dates = [datetime.datetime.fromtimestamp(ts / 1000) for ts, _ in candles]
    prices = [price for _, price in candles]
    return dates, prices, "coinbase"
