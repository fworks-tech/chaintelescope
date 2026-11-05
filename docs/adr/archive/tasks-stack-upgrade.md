# Tasks: Stack Upgrade (Full Plan)

Each task fits in one commit. Order matters — nothing depends on something later.

## Tier 1 — Quick wins

- [ ] feat(cache): add `st.cache_data` TTL to `load_dashboard_snapshot()` in `src/data/dashboard_query.py` (30s TTL)
- [ ] feat(logging): add `loguru` to `requirements.txt`, replace silent `except: continue` with `logger.warning()` in `src/data/market/service.py`, `src/data/news/ingestion.py`, `src/data/newsletter/store.py`
- [ ] feat(retry): add `tenacity` retry decorator (`@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))`) to `fetch_binance_series`, `fetch_coingecko_series`, `fetch_coinbase_series`
- [ ] test(cache): update tests to verify cached snapshot returns same object within TTL
- [ ] test(retry): patch provider to fail twice then succeed; verify retry logic

## Tier 2 — Architecture upgrades

- [ ] feat(exchange): add `ccxt` to deps, replace `src/data/market/binance.py`, `src/data/market/coingecko.py`, `src/data/market/coinbase.py` with unified `ccxt` adapters in `src/data/market/ccxt_adapter.py`
- [ ] feat(async): add `httpx` to deps, create `async_fetch_price_trend()` in `src/data/market/service.py` using `httpx.AsyncClient`
- [ ] test(exchange): verify ccxt adapter returns same shape as old adapters (dates, prices, source)
- [ ] feat(scheduler): add `apscheduler` to deps, create `src/worker.py` with scheduled jobs (newsletter dispatch every 6h, alert evaluation every 15min)
- [ ] feat(api): add `fastapi` + `uvicorn` to deps, create `src/api.py` with health check endpoint and trigger endpoints for background jobs
- [ ] feat(db): add `sqlalchemy` + `aiosqlite` to deps, create `src/data/database.py` with models for subscriptions, alerts history, price snapshots
- [ ] feat(config): add `pydantic-settings` to deps, create `src/config.py` that loads all env vars into typed `Settings` model
- [ ] test(db): test database CRUD operations with in-memory SQLite
- [ ] test(api): test FastAPI endpoints with `httpx.AsyncClient` + `TestClient`

## Tier 3 — Quality & dev experience

- [ ] feat(mypy): add `mypy` to dev deps, create `pyproject.toml` mypy config, fix all type errors in `src/` and `tests/`
- [ ] feat(pre-commit): add `.pre-commit-config.yaml` with hooks: ruff, ruff-format, mypy, trailing-whitespace, end-of-file-fixer
- [ ] feat(rich): replace `print()` in `scripts/pr-skill.py` with `rich.console.Console()` for colored, formatted output
- [ ] feat(sentry): add `sentry-sdk` to deps, initialize in `app.py` and `src/worker.py` with `SENTRY_DSN` env var
- [ ] docs(adr): mark ADR-001 as Accepted after first task is implemented

## Docker deployment

- [ ] feat(docker): add `Dockerfile` for Streamlit + FastAPI multi-stage build
- [ ] feat(docker): add `docker-compose.yml` with services: streamlit, api, redis, db
- [ ] feat(docker): add `.dockerignore` excluding `.venv`, `__pycache__`, `.git`, `data/`
- [ ] docs(deploy): add `docs/deployment.md` with Docker setup instructions
