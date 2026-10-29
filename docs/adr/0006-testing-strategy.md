# ADR 0006: Comprehensive Testing and Verification Strategy

## Status

Accepted

## Context

Moving from a dynamic Python environment to strict TypeScript requires automated verification across unit, integration, and performance layers, especially to test non-blocking guarantees and HTTP contracts.

## Decision

Standardize on a three-tier testing strategy:

1. **Unit Testing:** **Vitest** for fast, isolated tests in `packages/shared` and core algorithmic hashing utilities.
2. **HTTP API Integration Testing:** `@hapi/shot` (via `server.inject()`) to test HTTP routes, status codes, and Joi validation without binding real network ports.
3. **Database Integration Testing:** PostgreSQL instances orchestrated via Docker / Testcontainers.

## Consequences & Trade-offs

- **Pros:** Fast feedback loops; HTTP tests run entirely in-process without port collision or socket overhead; verifiable database constraints.
- **Cons:** Requires local Docker daemon for containerized integration tests.

## Rejected Alternatives

- **Supertest over Live HTTP Server:** Rejected for unit/API tests because starting real TCP listeners adds port allocation latency compared to Hapi's in-memory `server.inject()`.
- **Mocking Database Connections (`pg-mock`):** Rejected for critical queries to ensure complex JOINs and migrations are validated against real PostgreSQL engines.
