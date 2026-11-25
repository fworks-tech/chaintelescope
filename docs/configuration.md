# Configuration

This document lists optional environment variables and Streamlit secrets for ChainTelescope. For setup and run instructions, see [README.md](../README.md).

## Loading order

1. Streamlit secrets in `apps/python/.streamlit/secrets.toml` when present
2. Environment variables from the shell or a local `.env` file loaded by `python-dotenv`
3. Built-in defaults in code

Do not commit secrets, `.env` files, or `apps/python/.streamlit/secrets.toml`.

## Assistant provider

| Variable                 | Required             | Default                     | Purpose                   |
| ------------------------ | -------------------- | --------------------------- | ------------------------- |
| `OPENAI_API_KEY`         | For live model calls | unset                       | OpenAI-compatible API key |
| `OPENAI_BASE_URL`        | No                   | `https://api.openai.com/v1` | Provider base URL         |
| `OPENAI_MODEL`           | No                   | `gpt-4o-mini`               | Model name                |
| `OPENAI_TIMEOUT_SECONDS` | No                   | `15`                        | HTTP timeout in seconds   |

When credentials are missing or provider calls fail, the assistant returns a local dashboard summary instead of raising.

## Market providers

| Variable                         | Required | Default | Purpose                                                                                                                                    |
| -------------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `MARKET_PROVIDER`                | No       | `auto`  | `auto`, `binance`, `coingecko`, `coinbase`, or `mock` (sidebar Source filter overrides this per session)                                   |
| `MARKET_REQUEST_TIMEOUT_SECONDS` | No       | `10`    | Per-provider timeout for Python and Node market requests; Node chain returns 503 with `Retry-After` when all providers fail or are invalid |

`auto` tries Binance, then CoinGecko, then Coinbase, then mock series from `apps/python/src/data/mock_market.py`. Exchange access goes through `ccxt` when it is installed; otherwise the built-in `httpx` fallback serves the same providers (slim/serverless installs have no `ccxt`).

## News sources

News sources are versioned in `packages/shared/src/news-sources.ts` and generated
into `apps/python/src/data/news/sources.generated.json`. The Python job reads
only enabled sources with approved automation/metadata rights and a current
review date. `NEWS_FEED_URLS` is no longer read and cannot bypass the registry.
The Node `NewsRepo` applies the same approved-source gate when reading existing
rows, so denied sources are hidden without deleting data. The Python process
caches successful feeds for their registered interval, serializes concurrent
misses, and backs off failed feeds for five minutes.

The only enabled automatic source in the initial registry is the SEC RSS feed.
Federal Register and CoinGecko remain disabled until their adapters ship.
Cointelegraph and CoinDesk are disabled pending rights review. See
[editorial/news-sources.md](editorial/news-sources.md).

When feeds are unreachable or empty, the local Python UI may use normalized
fallback items. The scheduled writer never persists mock rows.

## Newsletter persistence and delivery

| Variable              | Required               | Default             | Purpose                                  |
| --------------------- | ---------------------- | ------------------- | ---------------------------------------- |
| `NEWSLETTER_DATA_DIR` | No                     | `data` at repo root | Directory for local subscription storage |
| `NEWSLETTER_PROVIDER` | No                     | `stub`              | Delivery adapter name                    |
| `NEWSLETTER_API_KEY`  | For non-stub providers | unset               | Provider credential                      |

Subscriptions are stored in `newsletter_subscriptions.json` under `NEWSLETTER_DATA_DIR`. The default `stub` provider queues a local success message without sending email.

## Local data directory

Runtime newsletter files live under `data/` at the repository root by default. That path is gitignored. Application code under `apps/python/src/data/` is source, not runtime storage.

## Example `.env`

```env
MARKET_PROVIDER=auto
NEWSLETTER_DATA_DIR=data
NEWSLETTER_PROVIDER=stub
```

## Related docs

- [CHANGELOG.md](../CHANGELOG.md)
- [Architecture.md](Architecture.md)
- [source-inventory-m4.md](source-inventory-m4.md)
