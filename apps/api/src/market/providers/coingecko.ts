import type {
  MarketProviderId,
  Snapshot,
  TimeWindow,
} from "@chaintelescope/shared";
import { COINGECKO_IDS } from "@chaintelescope/shared";
import type { MarketProvider } from "../provider.js";
import { buildSeries, windowDays } from "../utils.js";

type FetchLike = typeof fetch;

function coinIdFor(asset: string): string {
  const id = COINGECKO_IDS[asset.toUpperCase()];
  if (!id) throw new Error(`coingecko id missing for ${asset}`);
  return id;
}

export class CoinGeckoMarketProvider implements MarketProvider {
  readonly id: MarketProviderId = "coingecko";
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
        const url = new URL(
          `https://api.coingecko.com/api/v3/coins/${coinIdFor(asset)}/market_chart`,
        );
        url.searchParams.set("vs_currency", "usd");
        url.searchParams.set("days", String(Math.max(days, 1)));
        url.searchParams.set("interval", "daily");
        const res = await this.fetchImpl(url, { signal });
        if (!res.ok) throw new Error(`coingecko ${res.status} for ${asset}`);
        const body = (await res.json()) as { prices?: unknown[] };
        const points = (body.prices ?? [])
          .filter(
            (p): p is [number, number] => Array.isArray(p) && p.length >= 2,
          )
          .map(([ts, price]) => ({ ts: Number(ts), price: Number(price) }));
        if (points.length === 0)
          throw new Error(`coingecko empty series for ${asset}`);
        return buildSeries(
          asset,
          points.map((p) => new Date(p.ts).toISOString()),
          points.map((p) => p.price),
          this.id,
        );
      }),
    );
    return { series, window, provider: this.id };
  }
}
