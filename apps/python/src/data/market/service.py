import re
import time
from datetime import datetime

from loguru import logger
from src.data.market.http_adapter import fetch_http_series
from src.data.market.providers import PROVIDER_NAMES
from src.data.mock_market import TIME_WINDOW_DAYS, price_trend_series

_CACHE: dict[tuple[str, str, int], tuple[float, tuple]] = {}
_CACHE_TTL_SECONDS = 60


def _ccxt_available() -> bool:
    try:
        import importlib.util

        return importlib.util.find_spec("ccxt") is not None
    except Exception:
        return False


def _now() -> float:
    return time.time()


def _sanitize_asset(asset: str) -> str:
    """Uppercase allowlist for venue ids and log lines (also uppercases)."""
    if not isinstance(asset, str) or not asset.strip():
        return "BTC"
    return re.sub(r"[^A-Z0-9._-]", "", asset.strip().upper())


def _rolling_mean(values, window=5):
    out = []
    for i, _ in enumerate(values):
        part = values[max(0, i - window + 1) : i + 1]
        out.append(sum(part) / len(part))
    return out


def fetch_price_trend(asset: str, days: int, time_window: str, market_source: str | None = None):
    asset = _sanitize_asset(asset)
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
    if provider in PROVIDER_NAMES:
        return [provider]
    return list(PROVIDER_NAMES)


def fetch_ccxt_series(*args, **kwargs):
    """Lazy shim: keeps `service.fetch_ccxt_series` patchable in tests
    while not importing ccxt (heavy) at module load on slim serverless env."""
    try:
        from src.data.market.ccxt_adapter import fetch_ccxt_series as _impl
    except ImportError:  # slim serverless env has no ccxt
        return None
    return _impl(*args, **kwargs)


def _fetch_provider_series(provider: str, asset: str, days: int):
    if provider not in PROVIDER_NAMES:
        return None
    # shortcut: per-process TTL cache; shared/Redis caching lands in #172
    key = (provider, asset, days)
    now = _now()
    hit = _CACHE.get(key)
    if hit is not None and hit[0] > now:
        return hit[1]
    if _ccxt_available():
        result = fetch_ccxt_series(provider, asset, days)
    else:
        result = fetch_http_series(provider, asset, days)
    if result:
        _CACHE[key] = (now + _CACHE_TTL_SECONDS, result)
    return result


def _mock_series(asset: str, days: int, time_window: str):
    fallback_days = TIME_WINDOW_DAYS.get(time_window, days)
    dates, prices, trend = price_trend_series(
        asset=asset, days=fallback_days, time_window=time_window
    )
    return dates, prices, trend, "mock"


def _normalize_dates(dates):
    """Strict ISO dates mirroring the Node chain validation (#178).

    Raises ValueError on the first invalid entry so the caller falls
    through to the next provider (finally mock) instead of fabricating now.
    """
    try:
        import pandas as pd
    except ImportError:
        pd = None  # type: ignore[assignment]
    normalized = []
    for value in dates:
        if isinstance(value, datetime):
            normalized.append(value)
            continue
        try:
            if isinstance(value, (int, float)):
                if pd is None:
                    parsed = datetime.fromtimestamp(value / 1000)
                else:
                    parsed = pd.to_datetime(value, unit="ms").to_pydatetime()
            else:
                if pd is None:
                    parsed = datetime.fromisoformat(str(value))
                else:
                    parsed = pd.to_datetime(value).to_pydatetime()
        except Exception as exc:
            raise ValueError(f"invalid market date: {value!r}") from exc
        if isinstance(parsed, datetime):
            normalized.append(parsed)
        else:
            raise ValueError(f"invalid market date: {value!r}")
    return normalized
