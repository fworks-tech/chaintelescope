# ChainTelescope

A modern command center for crypto intelligence, built to transform noisy market data into practical decisions.

Live at [https://chain-telescope.streamlit.app](https://chain-telescope.streamlit.app/)

## Purpose
This project delivers a focused crypto analysis experience with:
- Market monitoring and watchlists
- Alerts and threshold notifications
- News aggregation and signal extraction
- Trending reports
- Risk and volatility graphs
- Email newsletter for subscribers

## Near-Term Product Scope
- Dashboard with key market KPIs
- Live trend charting and risk panels
- Alerts feed and configurable rules
- Curated market-news stream
- Scheduled newsletter generation

## Future Features (Far-Future)
- WhatsApp conversational delivery with same content from the web platform
- Buy/sell execution through partner exchanges

## Tech Direction

Two stacks live side by side during the migration:

- **Python 3.11 + Streamlit** (`apps/python/`) — the working product today, and the reference implementation. Feature-frozen; still gets fixes.
- **Node.js 20+ / TypeScript + Hapi.js** (`apps/api`) with a **React + Vite** client (`apps/web`) — the target architecture. Mid-migration: the API serves auth, scans, newsletter, and `GET /api/price-trend` (`GET /api/snapshot` returns 503 until #122); `apps/web` is a shell (router + dashboard + typed `/api/price-trend` client), not yet at parity.

See [ADR-0008](docs/adr/0008-monorepo-target-architecture.md) for the multi-app target (`apps/api` on ECS + RDS, `apps/python` + `apps/web` on Vercel).

`docs/port-inventory.md` tracks what has actually been ported, module by module.

## Prerequisites
- Python 3.11 (Streamlit app)
- Node.js 20+ and pnpm 12 (Node API)
- Git

## Quick Start

Clone the repository and create a virtual environment from the repository root, then run the Python app from `apps/python/`.

Windows (PowerShell):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r apps/python/requirements.txt
streamlit run apps/python/app.py
```

macOS / Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r apps/python/requirements.txt
streamlit run apps/python/app.py
```

Open the local URL shown in the terminal (default: http://localhost:8501).

Optional launcher from the repository root:

```powershell
.\scripts\run-app.ps1
```

```bash
python scripts/run_app.py
```

### Node API

```bash
pnpm install
pnpm build
node --env-file=apps/api/.env.example apps/api/dist/main.js   # needs Postgres; see apps/api/.env.example
curl http://localhost:3000/healthz
```

Gates: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm test` (builds first — the Node tests import compiled output), and `pnpm test:integration` with a `DATABASE_URL`.

## Validation

Confirm the app behaves as expected before opening a pull request.

- [ ] `streamlit run apps/python/app.py` starts without import errors
- [ ] Dashboard, Alerts, News, Risk, and Newsletter routes render in the browser
- [ ] Newsletter subscribe shows success for a valid email and an error for invalid input
- [ ] `python -m unittest discover -s apps/python/tests -t apps/python -p 'test_*.py'` passes (74 tests)
- [ ] `ruff check apps/python` and `ruff format --check apps/python` pass when Ruff is installed locally
- [ ] `python -m unittest discover -s apps/python/tests -t apps/python -p test_source_inventory_note.py` passes for the M4 source inventory note contract
- [ ] `pnpm test` passes for the Node workspaces

### M4 source inventory note

The planning note in [`docs/source-inventory-m4.md`](docs/source-inventory-m4.md) is guarded by local doc-contract tests:

```bash
python -m unittest discover -s apps/python/tests -t apps/python -p 'test_source_inventory_note.py'
```

## AI Assistant (MVP)

The dashboard includes an **AI Assistant** panel for short, context-grounded Q&A about the current watchlist, time window, KPI snapshot, alerts, news snapshot, and trending highlights.

### Provider configuration

Use environment variables or Streamlit secrets (`.streamlit/secrets.toml`); do not commit keys.

- `OPENAI_API_KEY` (required for live model calls)
- `OPENAI_BASE_URL` (optional, default `https://api.openai.com/v1`)
- `OPENAI_MODEL` (optional, default `gpt-4o-mini`)
- `OPENAI_TIMEOUT_SECONDS` (optional, default `15`)

If credentials are missing, rate-limited, or provider calls fail, the assistant returns a safe local fallback summary instead of crashing.

### Provider and interface choice (current)

- **Interface now:** Python/Streamlit in-app chat panel (MVP).
- **Messenger channels (WhatsApp/Telegram):** out of scope for this issue and planned as a later delivery surface.
- **Provider strategy:** OpenAI-compatible endpoint so teams can compare providers by model quality, latency, and cost without changing UI flow. Use `OPENAI_BASE_URL` + `OPENAI_MODEL` for A/B comparisons.

### Product boundaries

- Assistant responses are informational, not financial advice
- No autonomous trading or exchange execution
- If context is missing, the assistant says so instead of inventing claims

### Follow-up mapping

- Source discovery follow-through: #22 and [`docs/source-inventory-m4.md`](docs/source-inventory-m4.md)
- Suggested next issues: chat persistence/history storage, retrieval/tool use against ingested datasets, and source citation rendering

### Assistant validation

- `python -m py_compile apps/python/app.py apps/python/src/components/assistant.py apps/python/tests/test_assistant.py`
- `cd apps/python && python -m unittest discover -s tests -p 'test_assistant.py' -v`

### Current limitations
- Market and feed providers fall back to mock or cached-safe output when remote configuration is unset or requests fail
- Newsletter delivery uses local persistence with a stub provider unless `NEWSLETTER_PROVIDER` and related secrets are configured
- Scheduled outbound jobs are not running in the repository yet

Optional environment variables and Streamlit secrets are documented in [`docs/configuration.md`](docs/configuration.md).

## CI

On push to `main` and on pull requests to `main`, GitHub Actions runs the gates in [`.github/workflows/ci.yml`](.github/workflows/ci.yml):

| Job | What it enforces |
|-----|------------------|
| `lint-and-typecheck` | `pnpm -r typecheck` (shared, api, web) and `pnpm -r lint` (oxlint on the web app) |
| `test-workspaces` | `pnpm test` then `pnpm test:integration` — builds first, Vitest unit suites, then the `*.integration.test.ts` suites against the `postgres:16-alpine` service container. |
| `build` | `pnpm -r build` across the monorepo |
| `python-app` | Ruff lint + format check, `py_compile` and import smoke check, and the 74 Python unittest cases (including the Streamlit `AppTest` smoke run) |
| `quality-gate` | Requires all four jobs above |

Local equivalents: see **Quality gates** in [`AGENTS.md`](AGENTS.md).

CI does not start a browser or run Playwright screenshot comparisons yet. See the **Visual regression** note in [`docs/Architecture.md`](docs/Architecture.md) for the deferred pilot path.

## Project Layout

- `apps/python/` (`app.py`, `pages/`, `src/`, `tests/`) — Python/Streamlit app (working product, feature-frozen)
- `apps/api/` — Hapi.js + TypeScript server (`src/main.ts` entrypoint)
- `apps/web/` — React + Vite SPA shell (router + typed `/api/price-trend` client; per-app `vercel.json`)
- `packages/shared/` — runtime-free TypeScript contracts shared by server and client
- `packages/openapi/` — generated OpenAPI spec (never hand-edit; `pnpm api:openapi`)
- `infra/` (PR 7) — CDK TypeScript (ECS Fargate + RDS + ALB + alarms)
- `apps/api/bench/` — benchmark scripts (worker threads vs main thread)
- `apps/api/migrations/` — plain-SQL schema + runner (`pnpm db:migrate`)
- `tests/` — Python unittest suite → `apps/python/tests/` in PR 4
- `docs/` — architecture, configuration, ADRs, port inventory ([index](docs/README.md)); specs live in `docs/spec/` (canonical)
- `CHANGELOG.md` — release history

## Documentation

- [`docs/README.md`](docs/README.md) — docs index (start here)
- [`docs/adr/0008-monorepo-target-architecture.md`](docs/adr/0008-monorepo-target-architecture.md) — multi-app target layout
- [`CHANGELOG.md`](CHANGELOG.md) — release history
- [`docs/Architecture.md`](docs/Architecture.md) — system structure and runtime flow
- [`docs/configuration.md`](docs/configuration.md) — environment variables and secrets
- [`docs/security/threat-model.md`](docs/security/threat-model.md) — assets, trust boundaries, attacks and OWASP mapping
- [`docs/security/secrets.md`](docs/security/secrets.md) — every API variable, rotation and leak response
- [`docs/port-inventory.md`](docs/port-inventory.md) — Python → Node port status, generated from the code
- [`docs/adr/`](docs/adr/) — architecture decision records (`archive/` holds superseded ones)
- [`docs/source-inventory-m4.md`](docs/source-inventory-m4.md) — M4 source discovery research

## Architecture

System structure, runtime flow, data boundaries, and planned evolution are documented in [`docs/Architecture.md`](docs/Architecture.md).

## Contributing

- Use [conventional commit](https://www.conventionalcommits.org/) messages
- Fill out [`.github/pull_request_template.md`](.github/pull_request_template.md) when opening a pull request
- Do not commit secrets or API keys
- Update README or architecture docs when setup or behavior changes

## Checklists

### First-time setup
- [ ] Clone the repository and `cd` into the root
- [ ] Install Python 3.11
- [ ] Create and activate a virtual environment
- [ ] Upgrade `pip` and install `apps/python/requirements.txt`

### Run and smoke test
- [ ] Run `streamlit run apps/python/app.py`
- [ ] Confirm the dashboard loads in the browser
- [ ] Confirm charts and tables render
- [ ] Exercise newsletter subscribe with valid and invalid email
- [ ] Run `python -m py_compile apps/python/app.py`

### Before opening a PR
- [ ] Choose change type and scope in the pull request template
- [ ] Record validation: local run, CI checks, and manual QA as applicable
- [ ] Use a conventional commit message
- [ ] Update README or docs if setup or behavior changed
- [ ] Confirm no secrets were added
- [ ] Mark the pull request ready for review

### Release / docs gate
- [ ] README explains how to run and validate the app
- [ ] CI is green on the branch
- [ ] `CHANGELOG.md` is updated when shipping a release

## License

MIT — see [`LICENSE`](LICENSE).

<!-- fworks-readme-footer v1 -->
## Links

- Repository: https://github.com/fworks-tech/chain-telescope
- Live app: https://chain-telescope.streamlit.app/
- Portfolio: https://fworks.tech
<!-- /fworks-readme-footer v1 -->
