# Docs Index

Single entry point for ChainTelescope documentation. If a doc is not listed here, it is orphaned — link it or delete it.

## Start Here

- [`Architecture.md`](Architecture.md) — system structure and runtime flow
- [`../README.md`](../README.md) — setup, quick start, CI overview
- [`../AGENTS.md`](../AGENTS.md) — agent guide, quality gates, conventions
- [`port-inventory.md`](port-inventory.md) — Python → Node port status, generated from the code

## Decisions

- [`adr/0001-node-ts-refactor.md`](adr/0001-node-ts-refactor.md) — migration from Python/Streamlit to Node.js/TypeScript
- [`adr/0002-hapi-over-express.md`](adr/0002-hapi-over-express.md) — Hapi.js over Express
- [`adr/0003-content-addressed-scan-domain.md`](adr/0003-content-addressed-scan-domain.md) — content-addressed identity for ingestion and scans
- [`adr/0004-postgres-over-json-files.md`](adr/0004-postgres-over-json-files.md) — relational Postgres over flat JSON files
- [`adr/0006-testing-strategy.md`](adr/0006-testing-strategy.md) — testing and verification strategy
- [`adr/0007-vertical-slices-and-truth-gates.md`](adr/0007-vertical-slices-and-truth-gates.md) — vertical slices, plain-SQL migrations, truth gates
- [`adr/0008-monorepo-target-architecture.md`](adr/0008-monorepo-target-architecture.md) — multi-app monorepo target (`apps/*`, `packages/*`, `infra/`); supersedes the `frontend/` layout in `spec/100`
- [`adr/0009-mui-tailwind-ui-stack.md`](adr/0009-mui-tailwind-ui-stack.md) — MUI + Tailwind as the web UI stack, themed from the Streamlit tokens
- [`adr/0010-serve-vs-feed.md`](adr/0010-serve-vs-feed.md) — Node serves as system of record, Python feeds via scheduled jobs
- [`adr/0011-rights-gated-news-sources.md`](adr/0011-rights-gated-news-sources.md) — source permissions, review expiry, generated registry and media policy
- [`adr/archive/`](adr/archive/) — superseded records (do not rewrite; see ADR-0007)

## Specs (canonical — `tasks/` retired)

- [`spec/074-fix-rss-feedparser.md`](spec/074-fix-rss-feedparser.md) — replace feedparser with httpx + ElementTree
- [`spec/100-vercel-fastapi-react-mvp.md`](spec/100-vercel-fastapi-react-mvp.md) — Vercel FastAPI + React SPA MVP (directory layout superseded by ADR-0008)
- [`spec/129-redux-toolkit-news-store.md`](spec/129-redux-toolkit-news-store.md) — typed Redux Toolkit store and News async lifecycle (partial #129)

## Operations

- [`configuration.md`](configuration.md) — environment variables and secrets
- [`deployment.md`](deployment.md) — deployment targets and runbooks
- [`development.md`](development.md) — local development workflow
- [`operations.md`](operations.md) — runbooks and incident response
- [`streams.md`](streams.md) — event streams and data flow
- [`api-contract.md`](api-contract.md) — HTTP API contract and status matrix

## Security

- [`security/threat-model.md`](security/threat-model.md) — assets, trust boundaries, attacks, OWASP mapping
- [`security/secrets.md`](security/secrets.md) — every API variable, rotation, leak response
- [`security/passwords.md`](security/passwords.md) — Argon2id, throttling, rotation
- [`editorial/news-sources.md`](editorial/news-sources.md) — source rights, image policy, onboarding and takedown

## Research

- [`../infra/README.md`](../infra/README.md) — AWS baseline and deploy runbook
- [`source-inventory-m4.md`](source-inventory-m4.md) — M4 source discovery research
- [`perf/`](perf/) — profiling evidence and benchmarks
