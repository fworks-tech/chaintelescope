/**
 * Syncs the canonical asset registry (`packages/shared/src/assets.ts`) into
 * `apps/python/src/data/registry.generated.json` (committed, slim-safe).
 * Never hand-edit the JSON: CI regenerates it and fails on `git diff`.
 *
 * Usage: `pnpm sync:assets` (builds @chaintelescope/shared first).
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

let registry;
try {
  registry = await import("../packages/shared/dist/assets.js");
} catch (err) {
  console.error("sync:assets: build @chaintelescope/shared first (`pnpm build:shared`)");
  throw err;
}

const { ASSET_SYMBOLS, BINANCE_SYMBOLS, COINBASE_PRODUCTS, COINGECKO_IDS } = registry;

if (!Array.isArray(ASSET_SYMBOLS) || ASSET_SYMBOLS.length === 0) {
  throw new Error("sync:assets: ASSET_SYMBOLS is empty, refusing to write");
}

const payload = {
  _generated: "do not edit by hand; run `pnpm sync:assets` (source: packages/shared/src/assets.ts)",
  WATCHLIST_OPTIONS: [...ASSET_SYMBOLS],
  COINGECKO_IDS: { ...COINGECKO_IDS },
  COINBASE_PRODUCTS: { ...COINBASE_PRODUCTS },
  BINANCE_SYMBOLS: { ...BINANCE_SYMBOLS },
};

const out = join(root, "apps/python/src/data/registry.generated.json");
writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`sync:assets: ${ASSET_SYMBOLS.length} assets -> ${out}`);
process.exit(0);
