# ADR 0007: Vertical slices, plain-SQL migrations, and truth gates

## Status

Accepted — 2026-11-04.

## Context

Milestones M1 and M2 were reported as complete, but the repository contained one HTTP route, zero tables, zero queries and no auth. `docs/port-inventory.md` marked modules `ported` that had no caller, `docs/Architecture.md` described a deployment that did not exist, and the worker benchmark's printed conclusion contradicted its own numbers. Layer-by-layer delivery produced individually testable pieces that never composed into a feature.

## Decision

1. **Vertical slices over layers.** Each slice must end in a user-visible outcome: route + persistence + screen. Milestone labels are organisational, not a definition of done.
2. **Definition of done:** a closed issue needs a command that proves it (test, script or CI job) and, where relevant, a reachable route. Code that compiles but has no caller stays `partial` in the inventory.
3. **Plain SQL migrations under `migrations/` with a small runner** instead of `node-pg-migrate`. The SQL is the artifact being reviewed.
4. **Integration tests read `DATABASE_URL`** and run against the CI `postgres:16-alpine` service container or a local `docker compose up db`. Testcontainers is dropped: it adds a dependency and a Docker-in-Docker failure mode for the same coverage. (Supersedes the Testcontainers clause of ADR-0006.)
5. **Analytics queries stay raw `.sql` files**, even though CRUD goes through Kysely. A query builder would hide the JOIN work this codebase exists to demonstrate.
6. **Benchmarks measure the serving process.** Worker-pool claims are validated with event-loop lag sampled inside the server under load (autocannon), not with caller-observed IPC latency.
7. **Docs describe the present.** `port-inventory.md` is regenerated from the working tree; superseded ADRs move to `docs/adr/archive/` rather than being rewritten.

## Consequences

- Slower issue burn-down per milestone, faster time-to-usable-feature.
- The Python app stays in CI until the React client reaches parity; freezing it earlier removed the only working test surface.
- Any new "done" claim is auditable by re-reading the inventory and running the gates in `AGENTS.md`.

## Alternatives rejected

- **Keep layer-by-layer milestones** (status quo): produced 16 passing tests and nothing a user could use.
- **Testcontainers per test file**: better isolation, but duplicates what the CI service container already provides.
- **Kysely Migrator for everything**: fewer moving parts, but hides the SQL DDL under a DSL during review.
