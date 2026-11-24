"""Static market provider registry: no heavy deps.

The slim serverless env has no ccxt, so the provider list must not come from
`ccxt_adapter` (which imports ccxt at module load). Symbol maps are
re-exported from `src.data.assets`, the single source for venue ids.
"""

from src.data.assets import BINANCE_SYMBOLS, COINBASE_PRODUCTS, COINGECKO_IDS

PROVIDER_NAMES = ("binance", "coingecko", "coinbase")

__all__ = [
    "BINANCE_SYMBOLS",
    "COINBASE_PRODUCTS",
    "COINGECKO_IDS",
    "PROVIDER_NAMES",
]
