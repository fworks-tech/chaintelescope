import {
  TIME_WINDOW_DAYS,
  type MarketProviderId,
  type MarketProviderSelection,
  type PriceTrend,
  type TimeWindow,
} from "@chaintelescope/shared";
import { ProviderChainExhaustedError } from "../errors/index.js";
import { isDomainError } from "../errors/index.js";
import { createMarketChain } from "./chain.js";
import type { MarketProvider } from "./provider.js";

export interface PriceTrendLogger {
  warn(obj: unknown, msg?: string): void;
}

export interface FetchPriceTrendOptions {
  readonly now?: () => Date;
  /** Python service falls back to mock on total failure; #138 AC wants 503. */
  readonly onExhausted?: "mock" | "throw";
  readonly timeoutMs?: number;
}

const EXCHANGE_IDS = ["binance", "coingecko", "coinbase"] as const;
type ExchangeId = (typeof EXCHANGE_IDS)[number];

function isExchangeId(id: string): id is ExchangeId {
  return (EXCHANGE_IDS as readonly string[]).includes(id);
}

function providerChain(
  selection: MarketProviderSelection,
  providers: readonly MarketProvider[],
): MarketProvider[] {
  const byId = new Map(providers.map((p) => [p.id, p]));
  if (selection === "mock") return [];
  if (selection !== "auto") {
    const p = byId.get(selection);
    return p ? [p] : [];
  }
  return EXCHANGE_IDS.map((id) => byId.get(id)).filter(
    (p): p is MarketProvider => p !== undefined,
  );
}

function basePrice(asset: string): number {
  const overrides: Record<string, number> = {
    BTC: 64000,
    ETH: 3200,
    SOL: 145,
    BNB: 580,
    XRP: 0.62,
  };
  if (asset in overrides) return overrides[asset]!;
  const watchlist = [
    "BTC",
    "ETH",
    "USDT",
    "BNB",
    "SOL",
    "XRP",
    "USDC",
    "ADA",
    "DOGE",
    "TRX",
    "AVAX",
    "LINK",
    "TON",
    "SHIB",
    "DOT",
    "POL",
    "BCH",
    "DAI",
    "LTC",
    "UNI",
    "ICP",
    "NEAR",
    "LEO",
    "APT",
    "FET",
    "ETC",
    "RENDER",
    "BONK",
    "PEPE",
    "KAS",
    "FIL",
    "CRO",
    "ARB",
    "STX",
    "XLM",
    "SUI",
    "OKB",
    "MNT",
    "IMX",
    "WIF",
    "OP",
    "INJ",
    "HBAR",
    "TIA",
    "FTM",
    "RUNE",
    "ATOM",
    "MKR",
    "SEI",
    "GRT",
    "THETA",
    "AAVE",
    "ALGO",
    "AR",
    "BGB",
    "EGLD",
    "SAND",
    "AXS",
    "ENS",
    "FLOW",
    "SNX",
    "XTZ",
    "MANA",
    "NEO",
    "KCS",
    "CHZ",
    "IOTA",
    "CAKE",
    "MINA",
    "PYTH",
    "QNT",
    "TAO",
    "JASMY",
    "GALA",
    "LDO",
    "COMP",
    "1INCH",
    "RAY",
    "CRV",
    "STRK",
    "GNO",
    "ZEC",
    "DYDX",
    "GLM",
    "EOS",
    "BSV",
    "BAT",
    "ZIL",
    "ENJ",
    "KAVA",
    "LRC",
    "APE",
    "ROSE",
    "CELO",
    "DASH",
    "PENDLE",
    "CKB",
    "TWT",
    "BLUR",
    "IOTX",
  ];
  const idx = watchlist.indexOf(asset);
  const index =
    idx >= 0 ? idx : [...asset].reduce((s, c) => s + c.charCodeAt(0), 0);
  const raw = 0.05 + (index + 1) * 1.37 + (asset.charCodeAt(0) % 17) * 0.91;
  return Math.round(raw * 10000) / 10000;
}

function rollingMean(values: readonly number[], window: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    let sum = 0;
    for (let j = start; j <= i; j++) sum += values[j]!;
    out.push(sum / (i - start + 1));
  }
  return out;
}

function mockSeries(
  asset: string,
  days: number,
  timeWindow: TimeWindow,
  now: Date,
): PriceTrend {
  const fallbackDays = TIME_WINDOW_DAYS[timeWindow] ?? days;
  const base = basePrice(asset);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dates: string[] = [];
  const prices: number[] = [];
  for (let i = 0; i < fallbackDays; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - (fallbackDays - 1 - i));
    dates.push(d.toISOString());
    prices.push(base + 1200 * Math.sin(i / 3) + i * (base * 0.0007));
  }
  return {
    asset,
    dates,
    prices,
    trend: rollingMean(prices, 5),
    source: "mock",
  };
}

function normalizeDates(dates: readonly (string | number | Date)[]): string[] {
  return dates.map((value) => {
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime())
      ? new Date().toISOString()
      : d.toISOString();
  });
}

export async function fetchPriceTrend(
  asset: string,
  days: number,
  timeWindow: TimeWindow,
  marketSource: MarketProviderSelection,
  providers: readonly MarketProvider[],
  logger: PriceTrendLogger,
  signal: AbortSignal,
  options: FetchPriceTrendOptions = {},
): Promise<PriceTrend> {
  const now = options.now ?? (() => new Date());
  const onExhausted = options.onExhausted ?? "throw";

  if (marketSource === "mock") {
    return mockSeries(asset, days, timeWindow, now());
  }

  const chainProviders = providerChain(marketSource, providers);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const chain = createMarketChain(chainProviders, logger, { timeoutMs });

  try {
    const snapshot = await chain([asset], timeWindow, signal);
    const series =
      snapshot.series.find((s) => s.asset === asset) ?? snapshot.series[0];
    if (series && series.prices.length > 0) {
      const dates = normalizeDates(
        series.dates as readonly (string | number | Date)[],
      );
      const prices = [...series.prices];
      return {
        asset,
        dates,
        prices,
        trend: rollingMean(prices, 5),
        source: series.source ?? snapshot.provider,
      };
    }
  } catch (error) {
    if (signal.aborted) throw error;
    const exhausted =
      error instanceof ProviderChainExhaustedError ||
      (isDomainError(error) && error.code === "provider_chain_exhausted");
    if (!exhausted) throw error;
  }

  if (onExhausted === "mock") {
    return mockSeries(asset, days, timeWindow, now());
  }
  throw new ProviderChainExhaustedError();
}
