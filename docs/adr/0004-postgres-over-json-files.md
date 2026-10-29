# ADR 0004: Relational PostgreSQL Store over Flat JSON Files

## Status

Accepted

## Context

The legacy application stored newsletter subscriptions and asset registries in flat JSON files (`data/newsletter_subscriptions.json`, `src/data/assets.py`). Concurrent read/write operations risked file corruption, race conditions, and lacked query capabilities.

## Decision

Migrate all persistence to a relational **PostgreSQL** database:

- Model relational schemas with strict foreign keys, unique constraints, and indexes.
- Handle complex analytical queries using explicit SQL JOINs (INNER, LEFT, FULL) and aggregations (`COALESCE`, `GROUP BY`).
- Implement row-level locking (`FOR UPDATE`) for concurrent scan jobs.

## Consequences & Trade-offs

- **Pros:** ACID transactions; zero data-race file corruption; flexible analytical reporting on hash scans.
- **Cons:** Requires database infrastructure provisioning and connection pool tuning (`pg.Pool`).

## Rejected Alternatives

- **SQLite / Embedded Flat Store:** Rejected due to concurrent write locking limitations and inadequate production multi-tenant scaling.
- **MongoDB / NoSQL:** Rejected because relational integrity and multi-table JOINs are core requirements for analytics and audit reporting.
