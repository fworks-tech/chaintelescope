# Spec: Vercel FastAPI + React SPA (MVP)

> Status: directory layout superseded by [ADR-0008](../adr/0008-monorepo-target-architecture.md).
> The `frontend/` plan below is replaced by `apps/web/` (Vercel static) + `apps/python/`
> (Vercel serverless). Behavior and acceptance criteria still apply; paths do not.

## Problem

The project has a dual Streamlit + FastAPI architecture that cannot deploy to Vercel — the auto-detected `app.py` (Streamlit entrypoint) does not export a FastAPI instance. Vercel explicitly asks for `[tool.vercel] entrypoint = "src.api:app"`. Beyond this config fix, the architecture needs a forward path: a FastAPI-only deployment on Vercel with a modern SPA frontend, while keeping Streamlit intact as a local dev/fallback UI.

## Proposed Solution

Add a React SPA (Vite) in `frontend/` that consumes the existing FastAPI endpoints. Configure Vercel to serve both: FastAPI for all `/api/*` routes and the React SPA for all other routes. Keep the entire existing Streamlit codebase untouched — Streamlit remains fully functional locally (`streamlit run app.py`). Streamlit views are not deleted; they serve as the reference implementation for React component parity.

### Directory layout

```
hasheyes/
├── frontend/                      # React SPA (new)
│   ├── src/
│   │   ├── api/client.ts          # Typed fetch wrapper for FastAPI endpoints
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx      # KPI row + price trend + news + risk + alerts
│   │   │   ├── News.tsx           # Full news feed
│   │   │   ├── Risk.tsx           # Risk analysis
│   │   │   └── Assistant.tsx      # AI assistant chat
│   │   ├── components/
│   │   │   ├── KpiRow.tsx
│   │   │   ├── PriceTrendChart.tsx
│   │   │   ├── NewsFeed.tsx
│   │   │   ├── RiskGraph.tsx
│   │   │   ├── AlertsPanel.tsx
│   │   │   └── Assistant.tsx
│   │   ├── App.tsx
│   │   ├── Layout.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── index.html
├── src/
│   ├── api.py                     # FastAPI app (unchanged)
│   ├── data/                      # Data layer (unchanged)
│   ├── validation/
│   ├── logging.py
│   ├── views/                     # Streamlit views (kept)
│   └── components/                # Streamlit components (kept)
├── pages/                         # Streamlit pages (kept)
├── vercel.json                    # NEW — route /api/* to FastAPI, /* to SPA
├── pyproject.toml                 # MODIFIED — add [tool.vercel] entrypoint
└── app.py                         # Streamlit entrypoint (unchanged)
```

## Out of Scope

- Deleting or removing Streamlit code — Streamlit remains fully runnable
- Newsletter page in React MVP (can be added later)
- Alerts as a standalone page (alerts panel lives in the Dashboard)
- Authentication / user accounts
- SSR or Next.js — plain Vite SPA with client-side routing
- Tests for React components (manual QA during MVP)

## Acceptance Criteria

- [ ] `vercel.json` routes `/api/*` to `src/api.py` (FastAPI) and `/*` to the React SPA
- [ ] `pyproject.toml` has `[tool.vercel] entrypoint = "src.api:app"`
- [ ] React app renders at the Vercel deployment URL
- [ ] Dashboard page displays KPI row, price trend chart, news feed, risk graph, alerts panel
- [ ] News page lists news items from `/api/news`
- [ ] Risk page renders risk scores from `/api/snapshot`
- [ ] Assistant page sends/receives messages from the assistant API
- [ ] `streamlit run app.py` still works without any changes
- [ ] All 74 existing tests pass
- [ ] Ruff lint and format clean

## Testing Strategy

- Existing 74 unit tests must pass unchanged (proof that FastAPI + data layer is untouched)
- Manual QA on Vercel deployment URL for React pages
- No new Python tests needed — no Python code changes beyond `pyproject.toml`

## Open Questions

None.

## Path mapping (post-PR 4)

`apps/python/` is the Vercel project root. Prefix every repo-root Python path above with `apps/python/`
(`app.py` → `apps/python/app.py`, `src/` → `apps/python/src/`, `pages/` → `apps/python/pages/`,
`requirements.txt` / `pyproject.toml` / `notebooks/` / `tests/` likewise). Root `vercel.json` is deleted;
the entrypoint stays `[tool.vercel] entrypoint = "src.api:app"` in `apps/python/pyproject.toml`.

## Migration Plan

This MVP is the first step of a gradual migration:

1. **MVP** (this spec) — FastAPI + React SPA with Dashboard, News, Risk, Assistant pages
2. **Phase 2** — Add remaining pages (Newsletter, Alerts standalone), parity with Streamlit
3. **Phase 3** — Deprecate Streamlit, remove `app.py` and `pages/`
