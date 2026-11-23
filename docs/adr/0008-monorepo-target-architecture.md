# ADR 0008: Monorepo Target Architecture — Multi-App Layout

**Date:** 2026-11-23
**Status:** Accepted

## Context

The repository holds two stacks during migration: a working Python 3.11 / Streamlit app at the repo root and a Node.js 20+ / TypeScript monorepo under `apps/` + `packages/` (see `docs/port-inventory.md` for the honest per-module scorecard). The Python side is the only working product today; the Node API serves auth, scans, newsletter, and `GET /api/price-trend`, with `GET /api/snapshot` returning 503 until non-market dependencies land (#122). `apps/web` is still the Vite starter template.

Three structural problems block the next phase:

1. The Python app lives at the repo root (`app.py`, `src/`, `pages/`, `tests/`), so every Python path, CI step, and doc link assumes root. A second deployable Python surface (Vercel serverless) and a per-app Vercel project root cannot be expressed.
2. `tasks/` and `docs/spec/` hold the same two documents in different forms. `tasks/` has the old checklists, `docs/spec/` the richer spec form. Two canonical places means neither is canonical.
3. `legacy/` contains only a freeze-policy README, but the word "legacy" is spread across `README.md`, `AGENTS.md`, `docs/Architecture.md`, and the CI job id `python-legacy`. The Python app is not legacy — it is the ML/dashboard surface that Vercel will host. The word misleads new contributors about what to delete.

## Decision

Adopt the aggressive multi-app layout. One repo, three deployables, shared contracts:

```
apps/api/       Hapi.js API → ECS Fargate + RDS (Postgres 16)
apps/python/    Streamlit dashboard + FastAPI + ML/data layer → Vercel (serverless)
apps/web/       React + Vite SPA → Vercel (static)
packages/shared/  runtime-free TypeScript contracts (API ↔ web)
packages/openapi/ generated OpenAPI spec (never hand-edited)
infra/          CDK TypeScript (VPC, ECS, RDS, ALB, alarms)
docs/spec/      canonical specs (tasks/ retired)
```

Ownership boundary:

- Python owns market/news ingestion, dashboard query, alerts rules, newsletter store, Streamlit views, and FastAPI parity surface. No new Node duplicate of a Python data transform without a port-inventory row.
- Node owns persistence (`migrations/` → `apps/api/migrations/` in PR 3), auth/session, scan pipeline, rate limiting, and the Hapi route surface. Services take repositories, never a pool (`apps/api/src/db/` only).
- `packages/shared` owns wire shapes (`Snapshot`, `PriceTrend`, `TimeWindow`, cursor). Both sides import types; neither side redefines them.

Deployment mapping:

| App           | Target            | Project root               | Notes                                                                                     |
| ------------- | ----------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| `apps/api`    | ECS Fargate + RDS | repo root (Docker context) | Dockerfile at `apps/api/Dockerfile`; image carries `dist` + `sql` + `migrations/` (PR 3)  |
| `apps/python` | Vercel serverless | `apps/python`              | entrypoint stays `[tool.vercel]` in `pyproject.toml`; no root `vercel.json` needed (PR 4) |
| `apps/web`    | Vercel static     | `apps/web`                 | SPA rewrite to `index.html`; `VITE_API_BASE_URL` at build time (PR 5)                     |

Docs rules:

- `docs/spec/` is canonical. `tasks/` is deleted; the one link pointing at it (`docs/adr/archive/003-fastapi-react-vercel.md`) is retargeted to `docs/spec/`.
- `docs/README.md` is the index. Every ADR and spec is listed there; orphaned docs are a bug.
- ADRs live in `docs/adr/`; superseded ones move to `docs/adr/archive/` without rewriting (per ADR-0007).
- `docs/port-inventory.md` stays the honest scorecard; nothing claims parity without a code caller.

Python freeze policy (moved from `legacy/README.md`, which is deleted in this ADR):

- The Python app is feature-frozen for product scope but remains the reference implementation for dashboard/ML behavior until the React client reaches parity.
- Bug fixes, data-provider hardening, and Vercel deployability work continue.
- New product features land in `apps/api` + `apps/web` behind a port-inventory row.

## Alternatives Considered

| Option                                              | Pros                | Cons                                                                                               | Why Rejected                                         |
| --------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Keep Python at repo root, add `apps/` only for Node | Zero file moves     | Python paths stay special-cased; two Vercel project roots cannot be expressed cleanly              | Blocks PR 4/5 routing                                |
| Conservative restructure (docs only, no moves)      | No churn            | Root-owned Python keeps breaking per-app Vercel config; `tasks/` duplication persists              | Defers the actual problem                            |
| Monorepo tool (Turborepo/Nx) now                    | Faster builds later | New tool for three apps; pnpm workspaces already cover `apps/*` + `packages/*`                     | YAGNI; revisit when build times hurt                 |
| Single Vercel project for web + python              | One dashboard       | Couples static SPA deploys to serverless Python deploys; root routing file becomes a merge hotspot | Two projects, one repo — Vercel supports it natively |

## Consequences

Easier:

- Each app has one root, one deploy target, one CI job. Vercel project settings map 1:1 to folders.
- `docs/spec/` has no twin; new specs have exactly one home.
- New contributors stop reading "legacy" as "delete this".

Harder:

- PR 4 moves every Python path (`app.py`, `src/`, `pages/`, `tests/`, `requirements.txt`, `pyproject.toml`). `tests/test_source_inventory_note.py` path resolution (`parents[1]` → `parents[3]`), `scripts/run_app.py`, CI `working-directory`, and `.gitignore` move with it. Vercel project-root setting is manual and must flip in the same window as the merge.
- PR 3 moves `migrations/` + `bench/` into `apps/api/` and must keep the `files` whitelist and `MIGRATIONS_DIR` depth correct or production loses its SQL.

New risks:

- Live Python deployment breaks if the Vercel root-directory change is not applied with PR 4. Mitigation: preview deployment from the PR branch first (recorded in PR 4 body).
- `DATABASE_URL` cannot be concatenated from Secrets Manager values at CDK synth time. PR 7 adds a `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` fallback in `apps/api/src/env.ts` so ECS injects parts, not a composed URL.

## References

- `docs/port-inventory.md` — honest port scorecard
- `docs/Architecture.md` — system structure (truth pass in PR 6)
- `docs/spec/100-vercel-fastapi-react-mvp.md` — superseded `frontend/` layout; ADR-0008 replaces its directory plan
- #122 (snapshot parity), #127 (resilience), #138 (market provider hardening — landed in #165)
- `docs/adr/0007-vertical-slices-and-truth-gates.md` — slices, plain-SQL migrations, truth gates
- `docs/adr/archive/003-fastapi-react-vercel.md` — original dual-deploy decision; directory layout superseded by this ADR
