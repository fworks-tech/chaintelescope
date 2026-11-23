import type {
  MarketProviderId,
  Snapshot,
  TimeWindow,
} from "@chaintelescope/shared";
import type { MarketProvider } from "../provider.js";
import { buildSeries, windowDays } from "../utils.js";

type FetchLike = typeof fetch;

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  USDT: "tether",
  BNB: "binancecoin",
  SOL: "solana",
  XRP: "ripple",
  USDC: "usd-coin",
  ADA: "cardano",
  DOGE: "dogecoin",
  TRX: "tron",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  TON: "the-open-network",
  SHIB: "shiba-inu",
  DOT: "polkadot",
  POL: "polygon-ecosystem-token",
  BCH: "bitcoin-cash",
  DAI: "dai",
  LTC: "litecoin",
  UNI: "uniswap",
  ICP: "internet-computer",
  NEAR: "near",
  LEO: "leo-token",
  APT: "aptos",
  FET: "fetch-ai",
  ETC: "ethereum-classic",
  RENDER: "render-token",
  BONK: "bonk",
  PEPE: "pepe",
  KAS: "kaspa",
  FIL: "filecoin",
  CRO: "crypto-com-chain",
  ARB: "arbitrum",
  STX: "blockstack",
  XLM: "stellar",
  SUI: "sui",
  OKB: "okb",
  MNT: "mantle",
  IMX: "immutable-x",
  WIF: "dogwifcoin",
  OP: "optimism",
  INJ: "injective-protocol",
  HBAR: "hedera-hashgraph",
  TIA: "celestia",
  FTM: "fantom",
  RUNE: "thorchain",
  ATOM: "cosmos",
  MKR: "maker",
  SEI: "sei-network",
  GRT: "the-graph",
  THETA: "theta-token",
  AAVE: "aave",
  ALGO: "algorand",
  AR: "arweave",
  BGB: "bitget-token",
  EGLD: "multiversx-egld",
  SAND: "the-sandbox",
  AXS: "axie-infinity",
  ENS: "ethereum-name-service",
  FLOW: "flow",
  SNX: "havven",
  XTZ: "tezos",
  MANA: "decentraland",
  NEO: "neo",
  KCS: "kucoin-shares",
  CHZ: "chiliz",
  IOTA: "iota",
  CAKE: "pancakeswap-token",
  MINA: "mina-protocol",
  PYTH: "pyth-network",
  QNT: "quant-network",
  TAO: "bittensor",
  JASMY: "jasmycoin",
  GALA: "gala",
  LDO: "lido-dao",
  COMP: "compound-governance-token",
  "1INCH": "1inch",
  RAY: "raydium",
  CRV: "curve-dao-token",
  STRK: "starknet",
  GNO: "gnosis",
  ZEC: "zcash",
  DYDX: "dydx-chain",
  GLM: "golem",
  EOS: "eos",
  BSV: "bitcoin-cash-sv",
  BAT: "basic-attention-token",
  ZIL: "zilliqa",
  ENJ: "enjincoin",
  KAVA: "kava",
  LRC: "loopring",
  APE: "apecoin",
  ROSE: "oasis-network",
  CELO: "celo",
  DASH: "dash",
  PENDLE: "pendle",
  CKB: "nervos-network",
  TWT: "trust-wallet-token",
  BLUR: "blur",
  IOTX: "iotex",
};

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
