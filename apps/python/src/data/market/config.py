import os

from dotenv import load_dotenv
from src.data.market.models import MarketConfig

load_dotenv()


def load_market_config() -> MarketConfig:
    try:
        timeout = float(os.getenv("MARKET_REQUEST_TIMEOUT_SECONDS", "10"))
    except (TypeError, ValueError):
        timeout = 10.0
    return MarketConfig(
        provider=os.getenv("MARKET_PROVIDER", "auto"),
        request_timeout_seconds=timeout,
    )
