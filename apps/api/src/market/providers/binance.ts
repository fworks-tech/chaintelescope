import type {
  MarketProviderId,
  Snapshot,
  TimeWindow,
} from "@chaintelescope/shared";
import { BINANCE_SYMBOLS } from "@chaintelescope/shared";
import type { MarketProvider } from "../provider.js";
import { buildSeries, windowDays } from "../utils.js";

type FetchLike = typeof fetch;

function symbolFor(asset: string): string {
  return BINANCE_SYMBOLS[asset.toUpperCase()] ?? `${asset.toUpperCase()}USDT`;
}

export class BinanceMarketProvider implements MarketProvider {
  readonly id: MarketProviderId = "binance";
  private readonly fetchImpl: FetchLike;

  constructor(fetchImpl: FetchLike = fetch) {
    this.fetchImpl = fetchImpl;
  }

  async fetchSnapshot(
    symbols: readonly string[],
    window: TimeWindow,
    signal: AbortSignal,
  ): Promise<Snapshot> {
    const days = windowDays(window);
    const series = await Promise.all(
      symbols.map(async (asset) => {
        const url = new URL("https://api.binance.com/api/v3/klines");
        url.searchParams.set("symbol", symbolFor(asset));
        url.searchParams.set("interval", days > 1 ? "1d" : "1h");
        url.searchParams.set("limit", String(Math.max(days, 1)));
        const res = await this.fetchImpl(url, { signal });
        if (!res.ok) throw new Error(`binance ${res.status} for ${asset}`);
        const rows = (await res.json()) as unknown[];
        const dates: string[] = [];
        const prices: number[] = [];
        for (const row of rows) {
          if (!Array.isArray(row) || row.length < 5) continue;
          dates.push(new Date(Number(row[0])).toISOString());
          prices.push(Number(row[4]));
        }
        if (prices.length === 0)
          throw new Error(`binance empty series for ${asset}`);
        return buildSeries(asset, dates, prices, this.id);
      }),
    );
    return { series, window, provider: this.id };
  }
}
