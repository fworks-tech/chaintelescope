# ADR-002: Next.js Migration

**Date:** 2026-07-01
**Status:** Proposed

## Context

ChainTelescope is a Streamlit-based crypto dashboard. Streamlit is ideal for rapid prototyping but has production limitations:

- **Sleep on inactivity** — Streamlit Cloud puts apps to sleep after ~7 days. Cold start takes 10-30s.
- **No background jobs** — can't run scheduled newsletter dispatch or alert evaluation.
- **Limited UI control** — Streamlit widgets are constrained; custom layouts require workarounds.
- **Single-process** — the data layer, UI, and state management all run in one process.

A VPS deployment with Docker solves the sleep problem, but the UI limitations remain. A Next.js migration solves both while adding API separation.

## Target Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Next.js UI  │────→│  FastAPI Backend │────→│  Python Data  │
│  (port 3000) │     │  (port 8000)     │     │  Layer        │
│              │     │                  │     │  src/data/    │
│  React SPA   │     │  REST + SSE      │     │  ccxt, RSS    │
└──────────────┘     └──────┬───────────┘     │  newsletter   │
                            │                  └──────────────┘
                     ┌──────▼───────────┐
                     │  Background      │
                     │  Worker          │
                     │  APScheduler     │
                     └──────────────────┘
```

**FastAPI** serves the existing Python data layer as REST endpoints.
**Next.js** renders the dashboard UI consuming the API.
**Worker** runs scheduled jobs (newsletter, alerts).

## API Endpoints

| Method | Endpoint | Returns | Source module |
|--------|----------|---------|--------------|
| GET | `/api/snapshot?window=30D&assets=BTC,ETH&source=auto` | `DashboardSnapshot` (JSON) | `dashboard_query.py` |
| GET | `/api/price-trend?asset=BTC&days=30&source=auto` | Price series | `market/service.py` |
| GET | `/api/news?watchlist=BTC,ETH` | News items | `news/ingestion.py` |
| GET | `/api/alerts?window=30D&assets=BTC` | Alert messages | `alerts/rules.py` |
| GET | `/api/newsletter/subscriptions` | Subscription list | `newsletter/store.py` |
| POST | `/api/newsletter/subscribe` | New subscription | `newsletter/store.py` |
| POST | `/api/assistant/ask` | AI response | `components/assistant.py` |
| GET | `/api/health` | OK / status | — |

## Frontend Pages (Next.js)

| Route | Component | Data source |
|-------|-----------|-------------|
| `/` | Dashboard | `/api/snapshot` |
| `/alerts` | Alerts page | `/api/alerts` |
| `/news` | News page | `/api/news` |
| `/risk` | Risk graph | `/api/snapshot` |
| `/newsletter` | Subscribe form | `/api/newsletter/*` |

UI components in `src/app/` with a shared layout, theme from `src/styles.py` translated to Tailwind CSS.

## Migration Phases

### Phase 1 — FastAPI backend (current repo, 2-3 days)

1. Add `fastapi` + `uvicorn` to `requirements.txt`
2. Create `src/api.py` with all endpoints
3. Add CORS middleware for Next.js dev server
4. Add `docker-compose.yml` with FastAPI service
5. Health check endpoint
6. Tests for all API endpoints

### Phase 2 — Next.js frontend (new directory, 1-2 weeks)

1. `npx create-next-app@latest frontend` — TypeScript, Tailwind, App Router
2. Shared theme (colors, typography from Streamlit CSS → Tailwind config)
3. API client module (fetch wrapper for FastAPI)
4. Dashboard page: KPI cards, price chart, risk graph, alerts/news panels
5. Alerts page
6. News page
7. Risk page
8. Newsletter page
9. AI assistant chat panel

### Phase 3 — Docker + Deploy (1 day)

1. Update `docker-compose.yml` with: fastapi + nextjs + worker
2. `Dockerfile` for Next.js
3. Nginx reverse proxy routing `/api` to FastAPI and `/` to Next.js
4. Environment variables for both services

## Files changed (Phase 1 only)

| File | Change |
|------|--------|
| `requirements.txt` | Add `fastapi`, `uvicorn` |
| `src/api.py` | **New** — FastAPI app with all endpoints |
| `docker-compose.yml` | Update with FastAPI service |
| `Dockerfile` | Update for multi-service |
| `tests/test_api.py` | **New** — API endpoint tests |

## Consequences

**Good:**
- No sleep — runs on VPS with Docker
- API separation — data layer can be consumed by any client
- Background worker support — newsletter, alerts scheduling
- Full UI control — custom charts, layouts, animations
- Vercel deploy option for frontend only

**Harder:**
- Two codebases to maintain (Python backend + JS frontend)
- No more Streamlit simplicity — need to build every UI component
- Chart rendering moves from Plotly to Recharts/D3 (or use Plotly.js)
- Session state management moves to React context/state
- Stale Streamlit docs need updating

**Risks:**
- Scope creep — it's easy to keep adding "one more thing" to the frontend
- Design debt — without a designer, the UI may look basic
- Splitting attention between two codebases
