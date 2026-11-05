# Python → Node.js / TypeScript Port Inventory

Generated from the working tree on 2026-11-04. This table describes **what the code does today**, not what a milestone plans to do. Re-generate it by walking `app.py`, `src/**/*.py` and `pages/**/*.py` before claiming parity in any doc, issue or PR.

Status legend:

- `ported` — behaviour exists in Node/TypeScript and is reachable from a route, job or exported API.
- `partial` — some code exists in Node, but it has no caller, no persistence, or no wire exposure.
- `pending` — no Node equivalent yet.
- `dropped` — deliberately not carried over.

| Source | Node target | Status | Evidence / gap |
| :--- | :--- | :--- | :--- |
| `app.py` | `apps/web` | `pending` | `apps/web` is still the unmodified Vite template; the Streamlit app remains the only working UI. |
| `pages/*.py` (5 stubs) | `apps/web` routes | `pending` | Delegation stubs for Streamlit multi-page routing; React routing does not exist yet. |
| `src/views/*.py` (6) | `apps/web` screens | `pending` | No screens implemented beyond the template. |
| `src/views/__init__.py` | `apps/web` data layer | `pending` | Cached dashboard snapshot wrapper; React has no data layer. |
| `src/api.py` (7 endpoints + handler) | `apps/api/src/routes/` | `partial` | Only `GET /healthz` exists; the six domain endpoints are not routed. |
| `src/app_shell.py` | `apps/web` filters | `pending` | Sidebar filter engine; no client state layer yet. |
| `src/components/*.py` (9 modules) | `apps/web` components | `pending` | No React components exist. |
| `src/styles.py` | `apps/web` styling | `pending` | Tailwind is not installed. |
| `src/data/dashboard_query.py` | `apps/api` query layer | `pending` | No repository or query layer. |
| `src/data/assets.py` (108 symbols) | Postgres seed | `pending` | No schema, no migrations, no seed. |
| `src/data/market/service.py` (fallback chain) | `apps/api` provider port | `pending` | No provider abstraction in Node. |
| `src/data/market/ccxt_adapter.py` | provider adapter | `pending` | Python uses `ccxt`; Node has no adapter. |
| `src/data/market/config.py`, `models.py`, `mock_market.py` | provider config/fixtures | `pending` | — |
| `src/data/news/ingestion.py` | `apps/api/src/ingest/news.ts` | `partial` | Canonical hashing and repo-backed `ON CONFLICT (content_hash) DO NOTHING` exist and are integration-tested, but no route or scheduler calls them and the fetch/parse stage is unwritten. |
| `src/data/news/models.py` | `apps/api/src/ingest/news.ts` types | `partial` | `RawNewsItem`/`NewsRow` mirrored; no fetch pipeline. |
| `src/data/alerts/rules.py` | alert evaluation | `pending` | — |
| `src/data/newsletter/store.py` | Postgres table | `pending` | JSON-file store still the only implementation. |
| `src/data/newsletter/delivery.py` | delivery provider | `pending` | — |
| `src/logging.py` | `apps/api` logger | `pending` | `hapi-pino` is installed but no plugin registers it. |
| `src/validation/email.py` | `packages/shared` Joi schema | `pending` | No shared validation contracts yet. |
| `src/__init__.py`, `src/components/__init__.py`, `src/data/__init__.py`, `src/validation/__init__.py` | — | `dropped` | Python package markers; no equivalent needed. |

## What actually exists on the Node side

| Area | Module | Status |
| :--- | :--- | :--- |
| Hashing | `apps/api/src/hashing/{core,sink,progress,scan-pipeline,algorithms}.ts` | `ported`, unit-tested |
| Workers | `apps/api/src/workers/{pool,worker-runner,tasks/*}.ts` | `ported`, unit-tested; benchmark in `bench/` needs a methodology fix |
| Canonicalisation | `packages/shared/src/{canonical,hash}.ts` | `ported`, unit-tested |
| Ingestion | `apps/api/src/ingest/{news,snapshot}.ts` | `partial` — repo-backed, news + snapshot dedupe integration-tested; no caller |
| Scan jobs | `apps/api/src/scans/{state-machine,orchestrator,daemon,cancellation,plugin}.ts` | `partial` — state machine, retry, reconcile and cancellation integration-tested; the daemon only registers when a source adapter is supplied, and none exists yet |
| HTTP | `apps/api/src/routes/health.ts` | `ported` (1 route) |
| DB access | `apps/api/src/db/{schema,tx,chunks,pool,migrate,analytics}.ts`, `db/repos/*`, `migrations/*.sql` e `apps/api/sql/*.sql` | `ported` — typed `DB`, `withTx`, repositories, fixture-tested analytics queries and schema tests |
| Auth | `apps/api/src/auth/{password,throttle,tokens,session,strategy,routes}.ts`, `db/repos/auth.ts`, migrations `0003` + `0008` | `partial` — register/login/refresh/logout/me, JWT strategy and reuse detection; admin routes in #122 |
