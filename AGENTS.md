# ChainTelescope — Agent Guide

One repo, two stacks:

- **Python 3.11 / Streamlit at the repo root** — the only working product today. Frozen for features, still gets bug fixes.
- **Node.js 20+ / TypeScript monorepo in `apps/` + `packages/`** — the target architecture, mid-migration. Right now it answers exactly one route (`GET /healthz`).

Do not describe the Node side as a finished port. `docs/port-inventory.md` is the honest scorecard; regenerate its status column from the code before claiming parity.

## Quick start

```powershell
# Python app (works today)
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
streamlit run app.py

# Node API (needs a DATABASE_URL and ARGON2_PEPPER; see apps/api/.env.example)
pnpm install
pnpm build
pnpm --filter @chaintelescope/api start        # -> dist/main.js
```

## Quality gates (run before every PR)

Python:
1. `ruff check app.py src pages tests`
2. `ruff format --check app.py src pages tests`
3. `python -m py_compile app.py` + `python -c "import importlib; importlib.import_module('app')"`
4. `python -m unittest discover -s tests -p 'test_*.py' -v` (74 tests, ~60 s)

Node:
1. `pnpm build` — must precede tests: `apps/api/test/worker-pool.test.ts` imports `../dist/**` and `@chaintelescope/shared` resolves to its `dist/`
2. `pnpm -r typecheck` (shared, api, web) — needs `packages/shared` built first (`pnpm build:shared`), because types resolve through its `dist/`
3. `pnpm -r lint` (oxlint on `apps/web`; the API has no lint yet)
4. `pnpm test` (= `pnpm build && pnpm -r test`)

CI (`.github/workflows/ci.yml`) jobs: `lint-and-typecheck`, `test-workspaces` (Postgres 16 service container; migrations are round-tripped before the DB suites run), `build`, `python-legacy`, and `quality-gate` which requires all four.

## Project structure

Node:

- `apps/api` — Hapi.js server (`src/main.ts` entry, `src/server.ts` builder, `src/env.ts` Joi-validated env)
  - `src/hashing/` — `digest`, streaming `scanStream`, `CountingSink`, `ProgressTransform`
  - `src/workers/` — `TaskPool` + `tasks/{parse-feed,match-blocklist}.ts`
  - `src/ingest/` — canonicalise → sha256 → repo `insertIfAbsent` (no caller yet)
  - `src/scans/` — state machine, `runScan`, in-process `ScanDaemon`, cancellation registry; wired into `buildServer` only when a source adapter is supplied
  - `src/db/` — `schema.ts` (hand-written `DB` mirroring the migrations), `tx.ts` (`withTx`), `repos/{scans,artifacts,news,snapshots,assets}.ts`, `chunks.ts`, `pool.ts` (Kysely decorated as `server.db`), `migrate.ts`, `analytics.ts` (carrega os `.sql`)
  - `sql/` — as três consultas analíticas (histórico, cobertura, blocklist), lidas em runtime por `db/analytics.ts`
  - `src/routes/` — `health.ts` only
- `apps/web` — Vite + React 19 template, untouched splash page; no router, no API client, no state layer
- `packages/shared` — runtime-free contracts: `canonicalize`, `digestsEqual`, `HEALTH_PATH`
- `bench/` — `main-thread-vs-pool.mjs` (worker-vs-main JSON parse); not wired into CI
- `legacy/README.md` — freeze policy for the Python app

Python:

- `app.py` — Streamlit entrypoint (`st.navigation`), `pages/` thin stubs → `src/views/` → `src/components/`
- `src/api.py` — FastAPI, 7 endpoints (the Node port covers none of them yet)
- `src/data/` — dashboard query, market providers via `ccxt_adapter.py`, news ingestion, alerts, newsletter
- `src/data/assets.py` — 100 asset symbols with provider ID mappings
- `tests/` — unittest only

## Conventions

- **Commits:** Conventional Commits, lowercase imperative subject.
- **Python:** ruff, line-length 100, rules `E,F,I,UP,B` (ignore `E501`), double quotes; unittest only — no pytest fixtures or decorators.
- **Node:** TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`, NodeNext ESM (import with `.js` suffix), Vitest in `apps/api/test/*.test.ts`, Prettier (`pnpm format`).
- **Docs:** ADRs in `docs/adr/`; anything superseded moves to `docs/adr/archive/` instead of being rewritten.

## Config & secrets

- Python: Streamlit secrets → env vars → defaults. Real vars read: `MARKET_PROVIDER`, `MARKET_REQUEST_TIMEOUT_SECONDS`, `NEWS_FEED_URLS`, `NEWSLETTER_*`, `CORS_ORIGINS`. See `docs/configuration.md`.
- Node: validated once in `apps/api/src/env.ts` (`NODE_ENV`, `HOST`, `PORT`, `DATABASE_URL`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL_DAYS`, `ARGON2_PEPPER`, `SCAN_DAEMON_ENABLED`, `SCAN_POLL_INTERVAL_MS`, `SCAN_CONCURRENCY`). Nothing loads `.env` automatically — use `node --env-file`.
- Never commit `.env`, `.streamlit/secrets.toml`, or real peppers/JWT secrets.

## Known gotchas

- `ARGON2_PEPPER` is **required at boot but consumed by nothing** — there is no auth code yet.
- No migrations are pending: `migrations/` holds the v1 schema and `pnpm db:migrate` applies it (runner in `apps/api/src/db/migrate.ts`). Integration tests skip without `DATABASE_URL`; `apps/api/vitest.config.ts` disables file parallelism because the DB suites share one schema.
- SQL lives only in `apps/api/src/db/`: services and ingestion take a repository (`NewsRepo`, `ScansRepo`, ...), never a pool. `grep -rn "selectFrom\|insertInto\|\.query(" apps/api/src --include=*.ts | grep -v "src/db/"` must stay empty.
- `apps/api/src/ingest/*` compiles and both `ingestNewsItem` and `ingestSnapshot` are exercised by `test/repos.test.ts`, but no route calls them yet.
- `apps/api/src/scans/*` compiles and has database coverage, but nothing claims a scan in production yet: `buildServer` only registers the daemon when `scanSourceFor` is supplied, and no fetcher exists for `feed`/`snapshot`. Uploads get their digest in the route (#122), not the daemon.
- The analytics SQL lives in `apps/api/sql/` and is read at runtime by `src/db/analytics.ts` (`../../sql/` resolves from both `src/db` and `dist/db`). `apps/api/package.json` whitelists `dist` and `sql` under `files`, which is what makes `pnpm deploy` (and the Docker image) ship the queries — dropping that field breaks analytics in production only.
- `ScanDaemon.start()` runs the boot reconciliation (`UPDATE scans SET status='failed', failure_reason='startup_reconciliation' WHERE status='running'`) before the first tick. It is single-node: starting a second instance marks the first instance's in-flight rows failed.
- The app-level transition table lives in `src/scans/state-machine.ts` and is enforced by `ScansRepo.transition`; the database only enforces the terminal-field CHECKs. `failed -> pending` is a legal edge (retry) even though the #111 sketch omitted it.
- `scans.asset_symbol` has no FK to `assets` on purpose: scans outlive the asset registry, and #114's coverage query is what surfaces orphaned symbols.
- `kysely` is pinned to `^0.28` because 0.29+ declares `engines.node >= 22`; the repo, `.nvmrc` and CI target Node 20. Moving to Node 22 (then kysely 0.29) is a separate chore.
- `ScansRepo.list` paginates on the tuple `(created_at, id)` — a timestamp-only cursor silently drops rows that share an instant.
- `hapi-pino` is installed, never registered — `server.log()` output goes nowhere.
- `apps/web` is a Vite starter template; the React surface is greenfield, not a partial port.
- The bench deliberately measures caller-observed lag; its printed conclusion does not match its own numbers (pool p99 is worse than main thread). Fix the methodology before quoting it.
- `.pre-commit-config.yaml` and `.devcontainer/` no longer exist; `scripts/pr-skill.py` remains the PR helper.
