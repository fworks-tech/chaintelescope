# M4 Source Discovery Note: Market, Feeds, Investors, Core Developers

This note inventories practical, local/CI-friendly data source options for M4 ingestion planning. It supports [#22](https://github.com/fworks-tech/chain-telescope/issues/22). The current implementation path is documented in [Architecture.md](Architecture.md).

## 1) Crypto market data

| Source | Access | Cost / License | Freshness & Quotas | Repo fit |
|---|---|---|---|---|
| Binance public market endpoints | REST (`/api/v3/klines`, depth, ticker, futures APIs); WebSocket streams for live market updates | Free public endpoints; exchange ToS applies | Near real-time; weight-based limits; occasional regional restrictions | Strong for spot+derivatives+order book with no key for baseline |
| CoinGecko API (free/demo + paid) | REST (markets, OHLC, categories) | Free tier + paid plans; attribution required | Good for dashboard cadence; key and per-minute limits | Strong aggregator fallback across many assets/exchanges |
| CCXT (library over many exchanges) | Python SDK wrapping exchange APIs | OSS library; underlying exchange ToS | Depends on exchange and configured rate-limit handling | Good abstraction layer, but adds integration complexity |
| Kaiko / CoinAPI / CryptoCompare | Vendor APIs | Paid/commercial licenses | High quality historical + SLAs | Defer until paid vendor need is explicit |

**Recommended default path:** Binance public API (spot+futures depth/OHLCV) + CoinGecko fallback for broad coverage when Binance data is missing/rate-limited.

**Explicit defer/alternative:** Defer paid vendors (Kaiko/CoinAPI) until SLA/compliance requirements exceed free-source reliability.

## 2) News and RSS/feed sources

| Source | Access | Cost / License | Freshness & Quotas | Repo fit |
|---|---|---|---|---|
| CoinDesk, The Block, Cointelegraph feeds | RSS/Atom via `httpx` + `xml.etree.ElementTree` | Usually free read access; publisher terms apply | Minutes; low ingestion cost; occasional feed changes | Strong for direct ingestion with parser normalization |
| Chain/project blogs (Ethereum, Solana, L2s) | RSS/Atom + changelog pages | Free public content | Event-driven release cadence | Strong for protocol-specific context and release correlations |
| Macro feeds (Fed, ECB, IMF press releases) | RSS/Atom/web feeds | Free public sources | Lower frequency, high macro relevance | Good background context for market move explanations |
| NewsAPI / GDELT APIs | API | Free limited + paid tiers | API-key quotas and pagination constraints | Useful fallback when RSS coverage gaps appear |

**Recommended default path:** RSS/Atom first (crypto outlets + official protocol blogs + macro outlets) normalized via `httpx` + `xml.etree.ElementTree` into one schema (`id`, `source`, `published_at`, `title`, `url`, `tags`).

**Explicit defer/alternative:** Defer paid aggregation APIs unless RSS reliability/coverage is insufficient.

## 3) Investors and capital markets signals

| Signal source | Access | Actionability | Signal quality | Maintenance cost |
|---|---|---|---|---|
| SEC EDGAR filings (13F, 8-K, S-1 for crypto-exposed entities) | Public API + filing feeds | Mostly context / medium-latency alerts | High legal reliability; delayed timing | Medium (entity mapping + parsing) |
| Public treasury wallets (project foundations, ETFs where disclosed) | On-chain explorers/APIs (Etherscan, Arkham labels, Dune dashboards) | Actionable for large transfer/treasury movement alerts | Medium (label ambiguity risk) | Medium-high (label curation) |
| ETF flow disclosures / issuer updates | Issuer pages + market-data APIs | Actionable daily context alerts | High for major products | Low-medium |
| VC/fund announcements (blogs, X reposts, press releases) | RSS/web/news feeds | Mostly background context | Medium-low (promotion/noise) | Medium |

**Recommended default path:** Start with high-confidence public disclosures (EDGAR + issuer ETF flows) for alerts, and keep on-chain whale/treasury data as secondary signals with confidence scoring.

**Explicit defer/alternative:** Defer broad social-based “smart money” scraping; use curated wallet watchlists only after manual verification.

## 4) Core developers and protocol communities

| Source | Access | Signal type | Noise risk | Repo fit |
|---|---|---|---|---|
| GitHub org/repo APIs (commits, releases, tags, issues) | REST/GraphQL | Core dev velocity, release cadence, incident clues | Low-medium | Primary source; attributable to official orgs |
| Official release notes/changelogs/status pages | RSS/API/web pages | Upgrade alerts, incidents, maintenance windows | Low | Primary for production-grade attribution |
| Governance forums (Discourse, Snapshot) | RSS/API/web scraping where allowed | Proposal lifecycle and sentiment context | Medium | Secondary, useful for roadmap risk context |
| Discord/Telegram dev channels | Bots/manual reads | Early chatter and incident hints | High | Defer as primary signal; use only curated official channels |

**Recommended default path:** Official GitHub + official changelogs/status pages as core developer signal baseline.

**Explicit defer/alternative:** Defer broad chat scraping; if needed, ingest only explicitly official announcement channels with manual allowlist.

## 5) Cross-cutting strategy (auth, secrets, caching, quotas, compliance, fallback)

- **Secrets/auth:** Keep optional provider keys in environment variables (`python-dotenv` already planned in repo docs); never commit keys; all ingestion modules must run with keyless defaults where possible.
- **Caching:** Use short-lived local cache (e.g., per-source TTL) to reduce quota pressure and improve dashboard responsiveness.
- **Quota handling:** Per-provider rate-limit guards, retries with backoff, and circuit-breaker style cooldown after repeated 429/5xx.
- **Compliance/licensing:** Track source ToS/attribution in provider metadata; avoid redistributing restricted raw data; store only derived metrics where needed.
- **Graceful degradation:** If provider config is unset/unavailable, return stale cache + explicit “data delayed/unavailable” status instead of hard failure.

## Recommended default stack by dashboard panel

| Panel / feature | Default | Fallback | Notes |
|---|---|---|---|
| KPIs + trend chart | Binance public endpoints | CoinGecko market endpoints | Works locally/CI without paid-only dependency when endpoints are reachable |
| Alerts/news feed | RSS/Atom via `httpx` + `xml.etree.ElementTree` (crypto + official blogs + macro) | NewsAPI (free tier) | Normalize + dedupe by URL/title hash |
| Risk/context panel | ETF flows + EDGAR summaries + official status pages | Curated on-chain watchlist snapshots | Weight alerts by source confidence |
| Newsletter source set | Same normalized feed store + top market movers | Cached last-good bundle | Ensure deterministic output when APIs fail |

## Mapping to existing issues and follow-ups

| Issue | Scope-aligned source decision linkage |
|---|---|
| [#14 — wire sidebar filters to dashboard data](https://github.com/fworks-tech/chain-telescope/issues/14) | Keep market/feed providers queryable by selected watchlist/time-window filters so panel data can be filtered consistently |
| [#15 — market data ingestion module](https://github.com/fworks-tech/chain-telescope/issues/15) | Implement market ingestion adapter with Binance default + CoinGecko fallback and graceful degradation when provider config is unset |
| [#16 — news feed ingestion module](https://github.com/fworks-tech/chain-telescope/issues/16) | Implement news/feed ingestion normalization around RSS/Atom (`xml.etree.ElementTree` schema + dedupe + timestamps) with NewsAPI fallback |
| [#17 — alerts rules engine (MVP)](https://github.com/fworks-tech/chain-telescope/issues/17) | Build alert rules over normalized market + high-confidence investor/developer signals, including per-signal confidence metadata |
| [#18 — newsletter persistence and delivery (MVP)](https://github.com/fworks-tech/chain-telescope/issues/18) | Implement newsletter persistence/delivery using normalized feed + market deltas, with cached fallback content and environment-based secrets |
| Proposed new issue | Provider registry + signal confidence taxonomy to standardize source metadata and alert scoring |

## Risks and prerequisites

- Source reliability differs by provider; must support failover and stale-data banners.
- On-chain entity attribution can be wrong; require confidence tiers and manual curation workflow.
- Some feeds change format without notice; parser schema/version checks are required.
- Prerequisite: shared normalized event model (market tick, feed item, signal event) before production ingestion coding.
- Prerequisite: source allowlist and ToS review for any non-RSS scraping endpoints.
