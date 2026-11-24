import type {
  MarketProviderId,
  MarketProviderSelection,
} from "@chaintelescope/shared";
import type { MarketProvider } from "./provider.js";
import { BinanceMarketProvider } from "./providers/binance.js";
import { CoinbaseMarketProvider } from "./providers/coinbase.js";
import { CoinGeckoMarketProvider } from "./providers/coingecko.js";
import { MockMarketProvider } from "./providers/mock.js";

export type { MarketProvider } from "./provider.js";
export {
  clearMarketCache,
  createMarketChain,
  getMarketMetrics,
  resetMarketMetrics,
} from "./chain.js";
export { fetchPriceTrend } from "./service.js";
export { MockMarketProvider } from "./providers/mock.js";
export { BinanceMarketProvider } from "./providers/binance.js";
export { CoinbaseMarketProvider } from "./providers/coinbase.js";
export { CoinGeckoMarketProvider } from "./providers/coingecko.js";

const PROVIDERS: Record<MarketProviderId, () => MarketProvider> = {
  binance: () => new BinanceMarketProvider(),
  coingecko: () => new CoinGeckoMarketProvider(),
  coinbase: () => new CoinbaseMarketProvider(),
  mock: () => new MockMarketProvider(),
};

export function resolveMarketProviders(
  selection: MarketProviderSelection,
): MarketProvider[] {
  if (selection === "auto") {
    return [PROVIDERS.binance(), PROVIDERS.coingecko(), PROVIDERS.coinbase()];
  }
  return [PROVIDERS[selection]()];
}
