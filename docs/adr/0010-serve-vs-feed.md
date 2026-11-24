# ADR 0010: Node Serves, Python Feeds — System of Record vs Research Jobs

**Date:** 2026-11-24
**Status:** Accepted

## Context

Two stacks know different things. Python owns ingestion (RSS via
`load_news_items`, ccxt market providers, snapshot/alert derivation) and
Jupyter exploration; Node owns serving (Hapi routes, auth, Kysely + Postgres,
typed contracts, CI). The provider chain was already duplicated once (ccxt in
Python, ported chain in Node) — the registry fix (#174/#175) resolved it with
a pattern: TypeScript source, generated artifact consumed by Python.

The News plan forces the choice: the React page talks to Node in prod, Node
has `news_items` + `NewsRepo` + `ingestNewsItem` with no writer, and Python
fetches live RSS per request. Meanwhile Postgres lives isolated in the VPC, so
anything outside AWS (e.g. GitHub Actions cron) cannot reach it.

## Decision

- **Node is the system of record and the only prod server**: owns the schema
  (migrations stay in `apps/api`), routes, auth, validation, scheduling.
- **Python researches and feeds**: Jupyter is lab-only (readonly on Postgres,
  never in the request path); proven logic ships as scheduled jobs that only
  `INSERT` with `ON CONFLICT (content_hash) DO NOTHING`.
- **The bridge is generated**: `packages/shared` is source in TS; Python
  consumes artifacts (asset registry JSON today, canonical-hash rule documented
  per job). Cross-writer hash compatibility is pinned by test vectors, not by
  shared code.
- First application (#196): Python job writes `news_items`, EventBridge
  Scheduler triggers a Fargate task in the VPC; `GET /api/news` reads
  `NewsRepo`.

## Alternatives Considered

| Option | Why Considered | Why Rejected |
|--------|---------------|-------------|
| Port everything to Node | Single stack, no bridge | Per-provider rewrite cost; Python's data ecosystem (pandas/ccxt/notebooks) not portable |
| Two serving APIs in prod | Zero backend work for News | Two auth/session/contract surfaces, two deploys; preview-rewrite fragility already noted |
| GitHub Actions cron writer | 30 lines, no infra | Runners can't reach VPC-isolated RDS (dynamic IPs); secret exfil surface on third-party runners |
| Lambda for the job | Cheaper than Fargate | `psycopg` needs libpq layer, VPC cold starts, and a new pattern in a repo that already operates Fargate well |
| Jupyter in the request path | Reuse exploration code directly | No tests, no CI, single point of failure without rollback |

## Consequences

**Positive:** each new ingestion follows one mold (script + schedule + dedup);
Python never migrates schema; the API route and the page stay thin.
**Negative:** Python needs a PG client (`psycopg`) and image pipeline it never
had; two runtimes to observe (CloudWatch covers both).
**Risk:** canonical-hash drift between writers — mitigated by a pinned vector
test on each side; if the rule changes, change both vectors in one PR.
