import type {
  MarketProviderId,
  Snapshot,
  TimeWindow,
} from "@chaintelescope/shared";
import type { MarketProvider } from "../provider.js";
import { buildMockSeries } from "../utils.js";

export interface MockMarketProviderOptions {
  readonly now?: () => Date;
}

export class MockMarketProvider implements MarketProvider {
  readonly id: MarketProviderId = "mock";
  private readonly now: () => Date;

  constructor(options: MockMarketProviderOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  async fetchSnapshot(
    symbols: readonly string[],
    window: TimeWindow,
    signal: AbortSignal,
  ): Promise<Snapshot> {
    if (signal.aborted) throw signal.reason ?? new Error("aborted");
    const now = this.now();
    const series = symbols.map((asset) =>
      buildMockSeries(asset, window, this.id, now),
    );
    return { series, window, provider: this.id };
  }
}
