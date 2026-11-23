import type {
  MarketProviderId,
  Snapshot,
  TimeWindow,
} from "@chaintelescope/shared";
import type { MarketProvider } from "../provider.js";
import { buildSeries, windowDays } from "../utils.js";

type FetchLike = typeof fetch;

function productFor(asset: string): string {
  return `${asset.toUpperCase()}-USD`;
}

export class CoinbaseMarketProvider implements MarketProvider {
  readonly id: MarketProviderId = "coinbase";
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
        const granularity = days > 1 ? 86400 : 3600;
        const url = new URL(
          `https://api.exchange.coinbase.com/products/${productFor(asset)}/candles`,
        );
        url.searchParams.set("granularity", String(granularity));
        const res = await this.fetchImpl(url, {
          signal,
          headers: { accept: "application/json" },
        });
        if (!res.ok) throw new Error(`coinbase ${res.status} for ${asset}`);
        const rows = (await res.json()) as unknown[];
        const candles = rows
          .filter(
            (row): row is [number, number, number, number, number, number] =>
              Array.isArray(row) && row.length >= 5,
          )
          .map((row) => ({
            time: Number(row[0]) * 1000,
            close: Number(row[4]),
          }))
          .sort((a, b) => a.time - b.time)
          .slice(-Math.max(days, 1));
        if (candles.length === 0)
          throw new Error(`coinbase empty series for ${asset}`);
        return buildSeries(
          asset,
          candles.map((c) => new Date(c.time).toISOString()),
          candles.map((c) => c.close),
          this.id,
        );
      }),
    );
    return { series, window, provider: this.id };
  }
}
