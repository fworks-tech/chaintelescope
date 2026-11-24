# ADR 0002: Adoption of Hapi.js over Express.js

## Status

Accepted

## Context

The backend API requires deterministic request lifecycles, enterprise-grade input validation, reliable plugin isolation, and standard HTTP error semantics to prevent unhandled promise rejections and silent failures.

## Decision

Adopt **Hapi.js (`@hapi/hapi`)** paired with `@hapi/joi` and `@hapi/boom`:

- Utilize Hapi's explicit 18-step request lifecycle extension points (`onPreAuth`, `onPostHandler`, etc.) for predictable middleware behavior.
- Standardize payload and query validation via `@hapi/joi` at the routing layer.
- Enforce strict RFC-compliant HTTP status codes through `@hapi/boom`.

## Consequences & Trade-offs

- **Pros:** Zero monkey-patching of `req`/`res` objects; Hapi's native fail-fast validation (400 by default, overridden to `422 semantic_validation` in this repo — see note) runs before business logic; superior enterprise plugin encapsulation.
  > Note (2026-11-24): the override lives in `apps/api/src/plugins/validation.ts`; plain `400` only comes from Hapi's parser on unparseable JSON.
- **Cons:** Steeper learning curve and smaller third-party ecosystem compared to Express middleware.

## Rejected Alternatives

- **Express.js:** Rejected due to unhandled middleware error leaks, lack of out-of-the-box input validation contracts, and excessive reliance on fragile monkey-patching.
- **Fastify:** Considered for raw throughput, but Hapi was chosen for its mature lifecycle governance, stability, and alignment with corporate enterprise constraints.
