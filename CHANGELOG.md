# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Node.js 20+ / TypeScript monorepo (`apps/api`, `apps/web`, `packages/shared`) with pnpm workspaces and strict TypeScript.
- Hapi.js API shell: Joi-validated environment contract, plugin composition, `GET /healthz`, graceful shutdown on `SIGTERM`/`SIGINT`.
- Content-addressed hashing core over `node:crypto` streams, a streaming scan pipeline with backpressure/abort/progress, and a `worker_threads` task pool.
- `docs/port-inventory.md` regenerated from the code; anything without a caller or persistence is marked `partial` instead of `ported`.
- `docs/adr/archive/` holding ADRs superseded by the Node/TypeScript cutover.

### Changed

- CI runs the Node gates (`typecheck`, `lint`, `test`, `build`) alongside restored Python gates; `pnpm test` builds first because the Node tests import compiled output.
- `apps/web` renamed to `@chaintelescope/web` so workspace filters resolve; `react-router-dom` and `recharts` removed until they are used.
- README, `AGENTS.md` and `docs/Architecture.md` now describe both stacks and their real state instead of the intended end state.

### Removed

- `apps/web/package-lock.json` (duplicate npm lockfile inside a pnpm workspace), the empty `.pre-commit-config.yaml`, and the empty `src/worker.py` / `src/data/database.py`.
- Unused API dependencies `@hapi/joi`, `@types/hapi__joi`, `@types/hapi__hapi`.

## [0.3.0] — 2026-07-01

### Added

- Renamed project to ChainTelescope (was Jupyter-Crypto-Wizard, then HashHelm).
- `st.navigation` routing in `app.py` — fully modular architecture via `pages/` → `src/views/` → `src/components/`.
- `src/logging.py` with centralized loguru sink configuration.
- `src/views/__init__.py` with `@st.cache_data(ttl=30)` cached snapshot wrapper.
- `src/styles.py` global CSS injection (wired into `app.py`).
- `notebooks/` directory with starter EDA notebook importing from `src/`.
- `docs/deployment.md` — Docker, domain setup, CI/CD guide.
- `docs/operations.md` — production runbook with health checks, monitoring, backups, incident response.
- `docs/development.md` — contributor guide with setup, conventions, workflow.
- `docs/adr/001-stack-recommendations.md` — architecture review and library upgrade roadmap.
- `loguru` structured logging across market, news, and newsletter modules.
- `tenacity` retry with exponential backoff on all three exchange API fetchers.
- 8 new tests: `test_caching.py`, `test_retry.py`, `test_logging.py` (43 total).
- PR automation: `scripts/pr-skill.py` (create/validate/summary subcommands).

### Changed

- `app.py` rewritten from 160 lines to 22 — delegates to modular architecture.
- Docs consolidated: `m4-data-pipelines.md`, `validation-and-manual-qa.md`, `agent-skills.md` merged into `Architecture.md` or deleted.
- `AGENTS.md` rewritten with verified facts, sidebar filter docs, 3 market providers.
- `src/data/news/ingestion.py` — replaced `feedparser` with `httpx` + stdlib `xml.etree.ElementTree` for Python 3.13+ compatibility.

### Added

- 9 unit tests for RSS/Atom feed parsing in `tests/test_news_ingestion.py`.
- `docs/spec/074-fix-rss-feedparser.md` — spec for feedparser replacement.

### Removed

- Inline rendering and sidebar widgets from `app.py` (now in `src/views/` and `src/app_shell.py`).
- 8 unused dependencies: `matplotlib`, `torch`, `torchvision`, `tqdm`, `fonttools`, `filelock`, `Pygments`, `schedule`.
- `feedparser` dependency — replaced by stdlib `xml.etree.ElementTree` + existing `httpx`.
- `scripts/QUICK_REF.md` (duplicate of `PR_SKILL_GUIDE.md`).
- Jupyter vestiges: stale notebooks scope in `pr-skill.py`, dead references in docs.

## [0.2.0] - 2026-05-12

### Added

- Routed Streamlit navigation for Dashboard, Alerts, News, Risk, and Newsletter pages.
- Shared sidebar filters in `src/app_shell.py` for time window and watchlist selection.
- Filter-aware `DashboardSnapshot` assembly in `src/data/dashboard_query.py`.
- Market ingestion adapters with Binance and CoinGecko fallbacks to mock data.
- RSS/Atom news ingestion with normalized feed items and safe fallback content.
- MVP alert rules and local newsletter persistence with stub delivery.
- AI assistant grounding from the shared dashboard snapshot with provider fallbacks.
- Launcher helpers in `scripts/run-app.ps1` and `scripts/run_app.py`.
- Expanded unit and smoke coverage, including Streamlit `AppTest` entrypoint checks.
- Layered CI jobs for tests, compile checks, Ruff lint/format, and advisory maintainability rules.
- Documentation for configuration, M4 pipelines, validation, and manual QA.

### Changed

- Modularized the dashboard into routed pages, views, and snapshot-driven components.
- Hardened feed rendering by escaping untrusted news titles in HTML panels.
- Normalized provider timestamps in market service output for chart consistency.

### Removed

- Legacy single-page sidebar navigation component in favor of `st.navigation` routes.

## [0.1.0] - 2026-05-12

### Added

- Initial Streamlit dashboard baseline in `app.py`.
- README runbook, validation checklists, and `docs/Architecture.md`.
- Python ignore rules for virtual environments, caches, and local env files.

[Unreleased]: https://github.com/fworks-tech/chain-telescope/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/fworks-tech/chain-telescope/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/fworks-tech/chain-telescope/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/fworks-tech/chain-telescope/releases/tag/v0.1.0
