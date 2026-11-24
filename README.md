# ChainTelescope

[![CI](https://github.com/fworks-tech/chaintelescope/actions/workflows/ci.yml/badge.svg)](https://github.com/fworks-tech/chaintelescope/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node 20](https://img.shields.io/badge/node-20-brightgreen.svg)](apps/api)
[![Python 3.11](https://img.shields.io/badge/python-3.11-blue.svg)](apps/python)

A focused crypto intelligence dashboard: market monitoring, alerts, news signal extraction, risk graphs, and a subscriber newsletter.

## Live

- Web app: [https://hasheyes-web-fworks-apps.vercel.app](https://hasheyes-web-fworks-apps.vercel.app/)
- API: `https://hasheyes.flabs.tech/api` ([contract](docs/api-contract.md))
- Legacy Streamlit demo: [https://chain-telescope.streamlit.app](https://chain-telescope.streamlit.app/)

## What it does

- Dashboard with key market KPIs, live trend charts, and risk/volatility panels
- Watchlists with configurable alert rules and an alerts feed
- Curated market-news stream with signal extraction
- Trending reports and allocation views
- Email newsletter subscription and scheduled generation

## Status

Two stacks live side by side during the migration:

- **Python 3.11 + Streamlit** (`apps/python/`) — the working product and reference implementation. Feature-frozen; still gets fixes.
- **Node.js 20 + TypeScript + Hapi.js** (`apps/api`) with a **React + Vite** client (`apps/web`) — the target architecture. Mid-migration: the API serves auth, scans, newsletter, and `GET /api/price-trend`.

See [ADR-0008](docs/adr/0008-monorepo-target-architecture.md) and [`docs/port-inventory.md`](docs/port-inventory.md) — the honest, module-by-module port scorecard.

## Quick start

Prerequisites: Python 3.11, Node.js 20 + pnpm 12, Git.

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .\.venv\Scripts\Activate.ps1
pip install -r apps/python/requirements.txt
streamlit run apps/python/app.py                     # http://localhost:8501
```

```bash
pnpm install && pnpm build
node --env-file=apps/api/.env apps/api/dist/main.js # needs Postgres; copy apps/api/.env.example first (dev values only)
curl http://localhost:3000/healthz
```

Full setup, conventions, and environment variables: [`docs/development.md`](docs/development.md), [`docs/configuration.md`](docs/configuration.md).

## Validation

```bash
cd apps/python && python -m unittest discover -s tests -p 'test_*.py'  # 94 tests
python -m ruff check app.py src pages tests && python -m ruff format --check app.py src pages tests
pnpm test   # Node unit suites (builds first); pnpm test:integration needs a DATABASE_URL
```

All gates, in order: [`AGENTS.md`](AGENTS.md). CI runs the same gates on every push and PR.

## Project layout

- `apps/python/` — Streamlit app + FastAPI data layer (working product, feature-frozen)
- `apps/api/` — Hapi.js + TypeScript server (entrypoint `src/main.ts`; plain-SQL migrations in `migrations/`)
- `apps/web/` — React + Vite SPA shell (router + typed `/api/price-trend` client)
- `packages/shared/` — runtime-free TypeScript contracts shared by server and client
- `packages/openapi/` — generated OpenAPI spec (never hand-edit; `pnpm api:openapi`)
- `infra/` — AWS CDK (ECS Fargate + RDS + ALB + alarms; see [`infra/README.md`](infra/README.md))
- `docs/` — architecture, configuration, ADRs, port inventory ([index](docs/README.md))

## Docs

- [`docs/README.md`](docs/README.md) — docs index (start here)
- [`docs/Architecture.md`](docs/Architecture.md) — system structure and runtime flow
- [`docs/configuration.md`](docs/configuration.md) — environment variables and secrets
- [`docs/api-contract.md`](docs/api-contract.md) — HTTP contract and pinned status matrix
- [`infra/README.md`](infra/README.md) — AWS baseline and deploy runbook

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md): setup, gates, Conventional Commits, and the PR process. Do not commit secrets or API keys.

## License

MIT — see [`LICENSE`](LICENSE).

<!-- fworks-readme-footer v1 -->
## Links

- Repository: https://github.com/fworks-tech/chain-telescope
- Live app: https://hasheyes-web-fworks-apps.vercel.app/
- Portfolio: https://fworks.tech
<!-- /fworks-readme-footer v1 -->
