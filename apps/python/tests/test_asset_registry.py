"""Registry test: the generated snapshot is the single runtime source (#174).

Stdlib only so it also runs in the slim serverless env.
"""

import json
import unittest
from pathlib import Path


class AssetRegistryTests(unittest.TestCase):
    def test_registry_loads_with_spot_checks(self):
        from src.data import assets

        path = Path(assets.__file__).with_name("registry.generated.json")
        snapshot = json.loads(path.read_text(encoding="utf-8"))

        self.assertEqual(list(assets.WATCHLIST_OPTIONS), snapshot["WATCHLIST_OPTIONS"])
        self.assertEqual(dict(assets.COINGECKO_IDS), snapshot["COINGECKO_IDS"])
        self.assertEqual(dict(assets.COINBASE_PRODUCTS), snapshot["COINBASE_PRODUCTS"])
        self.assertEqual(dict(assets.BINANCE_SYMBOLS), snapshot["BINANCE_SYMBOLS"])

        self.assertGreater(len(assets.WATCHLIST_OPTIONS), 90)
        self.assertEqual(assets.COINGECKO_IDS["BTC"], "bitcoin")
        self.assertEqual(assets.COINGECKO_IDS["POL"], "polygon-ecosystem-token")
        self.assertEqual(assets.COINBASE_PRODUCTS["POL"], "MATIC-USD")
        self.assertEqual(assets.BINANCE_SYMBOLS["BTC"], "BTCUSDT")
        self.assertEqual(assets.DEFAULT_WATCHLIST, ("BTC", "ETH", "SOL"))


if __name__ == "__main__":
    unittest.main()
