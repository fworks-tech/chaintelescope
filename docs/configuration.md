# Configuration

This document lists optional environment variables and Streamlit secrets for ChainTelescope. For setup and run instructions, see [README.md](../README.md).

## Loading order

1. Streamlit secrets in `.streamlit/secrets.toml` when present
2. Environment variables from the shell or a local `.env` file loaded by `python-dotenv`
3. Built-in defaults in code

Do not commit secrets, `.env` files, or `.streamlit/secrets.toml`.

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

`auto` tries Binance, then CoinGecko, then Coinbase, then mock series from `src/data/mock_market.py`. Exchange endpoints are managed internally by `ccxt`.

## News feeds

| Variable         | Required | Default                                 | Purpose                       |
| ---------------- | -------- | --------------------------------------- | ----------------------------- |
| `NEWS_FEED_URLS` | No       | CoinDesk and Cointelegraph RSS defaults | Comma-separated RSS/Atom URLs |

When feeds are unreachable or empty, the app uses normalized fallback items so the News page and dashboard snapshot still render.

## Newsletter persistence and delivery

| Variable              | Required               | Default             | Purpose                                  |
| --------------------- | ---------------------- | ------------------- | ---------------------------------------- |
| `NEWSLETTER_DATA_DIR` | No                     | `data` at repo root | Directory for local subscription storage |
| `NEWSLETTER_PROVIDER` | No                     | `stub`              | Delivery adapter name                    |
| `NEWSLETTER_API_KEY`  | For non-stub providers | unset               | Provider credential                      |

Subscriptions are stored in `newsletter_subscriptions.json` under `NEWSLETTER_DATA_DIR`. The default `stub` provider queues a local success message without sending email.

## Local data directory

Runtime newsletter files live under `data/` at the repository root by default. That path is gitignored. Application code under `src/data/` is source, not runtime storage.

## Example `.env`

```env
MARKET_PROVIDER=auto
NEWS_FEED_URLS=https://www.coindesk.com/arc/outboundfeeds/rss/,https://cointelegraph.com/rss
NEWSLETTER_DATA_DIR=data
NEWSLETTER_PROVIDER=stub
```

## Related docs

- [CHANGELOG.md](../CHANGELOG.md)
- [Architecture.md](Architecture.md)
- [source-inventory-m4.md](source-inventory-m4.md)
