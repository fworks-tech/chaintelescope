import type {
  MarketProviderId,
  Snapshot,
  TimeWindow,
} from "@chaintelescope/shared";

export interface MarketProvider {
  readonly id: MarketProviderId;
  fetchSnapshot(
    symbols: readonly string[],
    window: TimeWindow,
    signal: AbortSignal,
  ): Promise<Snapshot>;
}
