# Python to Node.js / TypeScript Port Inventory

This inventory tracks the parity migration of every source module from the legacy Python codebase (`src/`, `pages/`, `app.py`) into the modern Node.js monorepo (`apps/api`, `apps/web`, `packages/shared`).

Status Legend:

- `ported`: Feature logic migrated to Node.js/TypeScript.
- `intentional gap`: Deferred to subsequent milestones or redesigned as an architectural improvement.
- `dropped`: Deprecated due to obsolete paradigm (e.g., Streamlit session rerun state).

| Source Module / File | Node Target Workspace | Target Location | Migration Status | Rationale & Architectural Notes |
| :--- | :--- | :--- | :--- | :--- |
| `app.py` | `apps/web` | `apps/web/src/App.tsx` | `ported` | Replaced Streamlit root entrypoint with a decoupled React SPA + Vite. |
| `src/api.py` (FastAPI routes) | `apps/api` | `apps/api/src/routes/` | `ported` | Converted 6 FastAPI endpoints into modular Hapi.js route plugins (`M4`). |
| `src/views/dashboard.py` | `apps/web` | `apps/web/src/pages/Dashboard.tsx` | `ported` | Rebuilt as reactive React screen utilizing Redux Toolkit queries (`M6`). |
| `src/views/scan.py` | `apps/web` | `apps/web/src/pages/ScanView.tsx` | `ported` | Interactive hash/file inspection view without full-page redraws. |
| `src/views/market.py` | `apps/web` | `apps/web/src/pages/MarketView.tsx` | `ported` | Market dashboard consuming backend resilience provider. |
| `src/views/news.py` | `apps/web` | `apps/web/src/pages/NewsView.tsx` | `ported` | Ingestion monitor and feed overview screen. |
| `src/views/settings.py` | `apps/web` | `apps/web/src/pages/SettingsView.tsx` | `ported` | User preferences and API configuration form. |
| `pages/*.py` (Streamlit pages) | `apps/web` | `apps/web/src/routes.tsx` | `dropped` | Streamlit multi-page routing dropped in favor of React Router DOM. |
| `src/data/market/` (Provider chain) | `apps/api` | `apps/api/src/services/market/` | `ported` | Ported Binance/CoinGecko/Coinbase chain to an injectable provider port (`M5`). |
| `src/data/news/ingestion.py` | `apps/api` | `apps/api/src/pipeline/harvest.ts` | `ported` | Modernized into a non-blocking stream pipeline with sha256 content addressing (`M2`). |
| `src/data/assets.py` | Postgres | `apps/api/src/db/seeds/assets.sql` | `ported` | 108 static asset symbols migrated into relational Postgres schema + seeds (`M3`). |
| `data/newsletter_subscriptions.json` | Postgres | `apps/api/src/db/migrations/002_subscribers.sql` | `ported` | Replaced flat JSON file with a persistent Postgres table with ACID guarantees (`M3`). |
| `src/core/hasher.py` | `apps/api` | `apps/api/src/core/hasher.ts` | `ported` | Converted synchronous hashing into non-blocking streams and worker offloading (`M2`). |
| `src/utils/helpers.py` | `packages/shared` | `packages/shared/src/utils/` | `ported` | Pure validation functions and string parsers shared between API and Web. |
