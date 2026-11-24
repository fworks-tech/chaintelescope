"""Asset registry loader: thin stdlib-only read of the generated snapshot.

The canonical registry lives in `packages/shared/src/assets.ts`. Run
`pnpm sync:assets` after editing it; CI fails on `git diff` if the snapshot
is stale. This module keeps the same public names, so importers are untouched.
"""

import json
from pathlib import Path

_REGISTRY_PATH = Path(__file__).with_name("registry.generated.json")

with open(_REGISTRY_PATH, encoding="utf-8") as _fh:
    _REGISTRY = json.load(_fh)

WATCHLIST_OPTIONS = tuple(_REGISTRY["WATCHLIST_OPTIONS"])
COINGECKO_IDS = dict(_REGISTRY["COINGECKO_IDS"])
COINBASE_PRODUCTS = dict(_REGISTRY["COINBASE_PRODUCTS"])
BINANCE_SYMBOLS = dict(_REGISTRY["BINANCE_SYMBOLS"])

DEFAULT_WATCHLIST = ("BTC", "ETH", "SOL")

__all__ = [
    "WATCHLIST_OPTIONS",
    "DEFAULT_WATCHLIST",
    "COINGECKO_IDS",
    "COINBASE_PRODUCTS",
    "BINANCE_SYMBOLS",
]
