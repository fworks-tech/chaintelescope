# ADR-001: Stack Recommendations

**Date:** 2026-07-01
**Status:** Proposed

## Context

ChainTelescope is a Streamlit dashboard with market data ingestion, news aggregation, alert rules, AI assistant, and newsletter persistence. The current stack works but has systemic weaknesses identified in an audit of `src/data/`:

- **No logging** anywhere — silent failures cascade to mock fallback
- **No caching** — every Streamlit rerun re-fetches from external APIs
- **No retry/backoff** — a single network blip skips an entire provider
- **No async** — `requests.get` and `httpx.get` block the Streamlit event loop
- **No rate-limit awareness** — HTTP 429 responses are not detected
- **No database** — newsletter subscriptions use a flat JSON file with no concurrent-write safety
- **No background jobs** — `schedule` was removed; no recurring newsletter generation or alert evaluation
- **Alert rules** only evaluate the primary watchlist asset, ignoring the rest

Deployment target is Docker/VPS, which makes background workers and a database viable.

## Recommendations

### Tier 1 — Quick wins (half-day each)

| Library | Why | Replaces |
|---------|-----|----------|
| `loguru` | Structured logging with zero config. Wrap every `except: continue` with `logger.warning(...)`. | Silent failures |
| `st.cache_data` | Streamlit's built-in TTL cache. Cache `load_dashboard_snapshot()` for 30-60s. Reduces API calls ~90%. | Repeated refetches |
| `tenacity` | Decorator-based retry with exponential backoff + jitter on `fetch_binance_series()`, `fetch_coingecko_series()`, `fetch_coinbase_series()`. | Bare `requests.get` |

**Impact:** Stops silent failures, adds observability, reduces API calls, adds resilience.

### Tier 2 — Architecture upgrades (1-2 days each)

| Library | Why | Replaces |
|---------|-----|----------|
| `httpx` | Async HTTP client with built-in timeouts, connection pooling. Use `httpx.AsyncClient` in provider adapters. Call via `asyncio.run()` or `anyio`. | `requests` |
| `ccxt` | Unified crypto exchange API — one library for Binance, Coinbase, CoinGecko, and 100+ others. Handles rate limits, unified response format, built-in retry. | 3 custom adapters |
| `apscheduler` | In-process job scheduler. Run newsletter generation, alert evaluation, data refresh on a cron schedule inside the same process or a separate worker. | `schedule` (removed) |
| `SQLAlchemy` + `aiosqlite` | Database persistence for newsletter subscriptions, historical alerts, price snapshots. Atomic writes, concurrent-safe, queryable. | Flat JSON file |
| `pydantic-settings` | Type-safe env var loading from `.env`/secrets. Validates at startup instead of failing at runtime. | ad-hoc `os.getenv` |

**Impact:** Async data pipeline, single exchange library, scheduled jobs, persistent storage, validated config.

### Tier 3 — Quality & dev experience

| Library | Why |
|---------|-----|
| `mypy` | Type-check the entire codebase. Catches interface mismatches before runtime. |
| `pre-commit` | Auto-run ruff + mypy + format on every commit. Enforces quality without thinking. |
| `rich` | Beautiful CLI output for `pr-skill.py` and notebook debugging. |
| `sentry-sdk` | Error tracking in production. Captures exceptions from background jobs. |

### Deployment architecture (Docker/VPS)

```
┌──────────────────────────────────────────────────┐
│                   Docker Host                     │
│  ┌─────────────┐  ┌──────────────┐               │
│  │  Streamlit  │  │  FastAPI     │               │
│  │  (port 8501)│  │  (port 8000) │               │
│  │             │  │              │               │
│  │  UI only    │  │  Background  │               │
│  │             │  │  jobs + API  │               │
│  └─────────────┘  └──────┬───────┘               │
│         │                │                       │
│         ▼                ▼                       │
│  ┌────────────────────────────────────────┐      │
│  │              Redis                      │      │
│  │  Cache (API responses) + Job Queue      │      │
│  └────────────────────────────────────────┘      │
│         │                                        │
│         ▼                                        │
│  ┌────────────────────────────────────────┐      │
│  │           SQLite / PostgreSQL            │      │
│  │  Subscriptions, alerts history, prices   │      │
│  └────────────────────────────────────────┘      │
└──────────────────────────────────────────────────┘
```

- **Streamlit** handles UI only — no data fetching on rerun (uses cached snapshot)
- **FastAPI** runs background jobs (newsletter generation, alert evaluation, data refresh)
- **Redis** caches API responses (TTL) and queues background jobs
- **Database** stores subscriptions, historical alerts, price snapshots

## Out of Scope

- Microservices / service mesh (overkill for a single-developer project)
- Kubernetes (Docker Compose is sufficient)
- Real-time websocket streaming (no exchange WebSocket integration planned yet)
- CI/CD pipeline beyond current GitHub Actions

## Consequences

- **Easier:** Observability, resilience, async performance, scheduled jobs, data persistence
- **Harder:** More moving parts (Redis, FastAPI worker), more deps to maintain, Docker Compose setup
- **Risks:** Over-engineering if the app stays small; learning curve for new libraries

## Recommended order of implementation

1. `st.cache_data` — zero deps, immediate win (hours)
2. `loguru` + `tenacity` — add logging and retry to market/news providers (half day)
3. `ccxt` — replace 3 custom adapters with one library (1-2 days)
4. `apscheduler` + FastAPI — background jobs for newsletter and alerts (2 days)
5. `SQLAlchemy` — replace flat file with database (1 day)
6. `pre-commit` + `mypy` — quality gates (half day)
