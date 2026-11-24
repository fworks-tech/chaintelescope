from datetime import datetime

from loguru import logger
from src.data.mock_market import TIME_WINDOW_DAYS, price_trend_series


def _rolling_mean(values, window=5):
    out = []
    for i, _ in enumerate(values):
        part = values[max(0, i - window + 1) : i + 1]
        out.append(sum(part) / len(part))
    return out


def fetch_price_trend(asset: str, days: int, time_window: str, market_source: str | None = None):
    try:
        from src.data.market.config import load_market_config

        provider = (market_source or load_market_config().provider).lower()
    except Exception:
        provider = (market_source or "auto").lower()
    if provider == "mock":
        return _mock_series(asset, days, time_window)

    providers = _provider_chain(provider)
    for name in providers:
        try:
            result = _fetch_provider_series(name, asset, days)
            if result:
                dates, prices, source = result
                dates = _normalize_dates(dates)
                try:
                    import pandas as pd

                    trend = pd.Series(prices).rolling(5, min_periods=1).mean()
                except ImportError:
                    trend = _rolling_mean(prices)
                return dates, prices, trend, source
        except Exception as exc:
            logger.warning("Provider {} failed for {}: {}", name, asset, exc)
            continue

    return _mock_series(asset, days, time_window)


def _provider_chain(provider: str) -> list[str]:
    try:
        from src.data.market.ccxt_adapter import EXCHANGE_NAMES
    except ImportError:
        return []
    if provider in EXCHANGE_NAMES:
        return [provider]
    return list(EXCHANGE_NAMES)


def fetch_ccxt_series(*args, **kwargs):
    """Lazy shim: keeps `service.fetch_ccxt_series` patchable in tests
    while not importing ccxt (heavy) at module load on slim serverless env."""
    try:
        from src.data.market.ccxt_adapter import fetch_ccxt_series as _impl
    except ImportError:  # slim serverless env has no ccxt
        return None
    return _impl(*args, **kwargs)


def _fetch_provider_series(provider: str, asset: str, days: int):
    try:
        from src.data.market.ccxt_adapter import EXCHANGE_NAMES
    except ImportError:
        return None
    if provider in EXCHANGE_NAMES:
        return fetch_ccxt_series(provider, asset, days)
    return None


def _mock_series(asset: str, days: int, time_window: str):
    fallback_days = TIME_WINDOW_DAYS.get(time_window, days)
    dates, prices, trend = price_trend_series(
        asset=asset, days=fallback_days, time_window=time_window
    )
    return dates, prices, trend, "mock"


def _normalize_dates(dates):
    try:
        import pandas as pd
    except ImportError:
        pd = None  # type: ignore[assignment]
    normalized = []
    for value in dates:
        try:
            if isinstance(value, datetime):
                normalized.append(value)
            elif isinstance(value, (int, float)):
                if pd is None:
                    normalized.append(datetime.fromtimestamp(value / 1000))
                else:
                    normalized.append(pd.to_datetime(value, unit="ms").to_pydatetime())
            else:
                if pd is None:
                    normalized.append(datetime.fromisoformat(str(value)))
                else:
                    normalized.append(pd.to_datetime(value).to_pydatetime())
        except Exception:
            normalized.append(datetime.now())
    return normalized
