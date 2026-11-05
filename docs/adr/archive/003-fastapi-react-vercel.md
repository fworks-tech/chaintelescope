# ADR-003: FastAPI + React SPA on Vercel

**Date:** 2026-07-07
**Status:** Proposed

## Context

The project ships a Streamlit dashboard (`app.py`) alongside a FastAPI REST API (`src/api.py`). Streamlit is excellent for rapid prototyping but is not natively deployable on Vercel — the auto-detected entrypoint (`app.py`) lacks a FastAPI `app` instance, causing every Vercel build to fail. Meanwhile, the FastAPI layer already has all endpoints needed for a programmatic frontend. The project needs a deployment path that unblocks CI and provides a modern, maintainable frontend.

## Decision

Adopt a dual-deployment architecture:

1. **FastAPI** serves as the backend on Vercel (serverless functions), handling all `/api/*` routes
2. **React SPA** (Vite + TypeScript) serves as the frontend, consuming the FastAPI API
3. **Streamlit** remains fully intact as a local development and prototyping UI — not removed
4. **Vercel** is the single deployment target, routing `/api/*` to FastAPI and `/*` to the React SPA

The Vercel configuration is:

- `vercel.json` routes traffic to the correct runtime
- `pyproject.toml` declares `[tool.vercel] entrypoint = "src.api:app"`
- CORS allows both the Vercel deployment URL and localhost origins

## Alternatives Considered

| Option | Pros | Cons | Why Rejected |
|--------|------|------|-------------|
| Keep Streamlit, deploy on Streamlit Community Cloud | Zero migration cost | Separate hosting, no unified deployment, limited scalability | Operational complexity of two platforms |
| Fix Vercel config only, keep Streamlit as UI | Quick fix | Streamlit still can't deploy on Vercel; no path forward | Delay, not a solution |
| Full Next.js rewrite | Best Vercel integration, SSR | Massive scope, would block shipping for weeks | Too heavy for MVP |
| FastAPI + Jinja2 templates | Simple, no JS build step | Limited interactivity, harder to maintain than components | UX gap vs. modern expectations |

## Consequences

**Easier:**
- Vercel deployments now work — single `git push` deploys both backend and frontend
- Frontend and backend evolve independently with clear API contracts
- React ecosystem (Recharts, component libraries) enables richer dashboards
- Streamlit remains as a local fallback — no breakage during migration

**Harder:**
- Two build systems (Python + Node.js) in one repo
- Frontend tests and type-checking add CI overhead (but are deferred for MVP)
- Developers need Node.js locally for frontend work

**New risks:**
- API surface must remain stable while both Streamlit and React consume it
- Vercel cold starts on serverless Python functions add latency
- CORS configuration must stay in sync with deployment URLs

## References

- [Spec: Vercel FastAPI + React SPA (MVP)](../spec/100-vercel-fastapi-react-mvp.md)
- [Tasks: 100-vercel-fastapi-react-mvp](../../tasks/100-vercel-fastapi-react-mvp.md)
- [Vercel Python docs](https://vercel.com/docs/functions/serverless-functions/runtimes/python)
- [`src/api.py`](../../src/api.py) — existing FastAPI app
