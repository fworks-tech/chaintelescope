# Threat model

Scope: the TypeScript API (`apps/api`) and the PostgreSQL schema it owns. The
Python/Streamlit app is frozen and not modelled here; it has no credentials
store and never talks to the new auth tables.

This is a lightweight model for a small service, not a formal assessment. The
goal is that every control has a named attack it stops and every gap is a
decision.

## Assets

| Asset | Why it matters | Where it lives |
|---|---|---|
| User credentials | Account takeover, credential reuse | `users.password_hash` (Argon2id + pepper) |
| Refresh tokens | Long-lived session hijack | `refresh_tokens.token_hash` (sha256 only) |
| Access tokens | 15-minute impersonation, including `admin` scope | client memory; never persisted server-side |
| Uploaded artifacts | User data and scan contents | `scan_artifacts` metadata; bytes are streamed and hashed, not stored |
| Newsletter subscribers | PII (e-mail, preferences) | `newsletter_subscriptions` |
| Secrets | Database access, token forgery, password cracking | process environment |

## Trust boundaries

```
browser ──HTTPS──▶ API process ──TCP──▶ PostgreSQL
                        │
                        └── future: market/news providers (no adapter yet)
operator ──environment──▶ API process
```

| Boundary | Control | Code / issue |
|---|---|---|
| Browser → API | CORS allowlist, `SameSite=Strict` refresh cookie, JWT bearer auth, OWASP headers | `plugins/secure-headers.ts`, `env.ts`, `auth/strategy.ts` (#121) |
| Browser → API | Request shape and size limits (50 MiB, Joi contracts) | `plugins/validation.ts`, `routes/scans.ts` (#117, #122) |
| API → PostgreSQL | Kysely parameter binding, SQL confined to `src/db/`, app-level state transitions | `db/*`, `scans/state-machine.ts` (#111, #114) |
| Operator → process | Boot-time validation, no `.env` loading, redacted logs | `env.ts`, `server.ts` (#118) |

## STRIDE-lite

| Threat | Realistic instance | Control |
|---|---|---|
| **S**poofing | Stolen/forged access token | HS256 with `JWT_ACCESS_SECRET`, `sub`/`scope`/`exp`, 15-minute TTL; `WWW-Authenticate: Bearer` on failures |
| **T**ampering | Client mutates a refresh token or scan id | Refresh token is random and looked up by sha256; ids are UUID-checked before SQL; state machine rejects illegal transitions |
| **R**epudiation | User denies uploading/cancelling | `scans.requestor` is the token subject on upload; no full audit table yet (gap) |
| **I**nformation disclosure | DB dump, logs, error bodies | Argon2id+pepper for passwords, sha256 for refresh tokens, pino redaction, opaque 500s, no token/hash in responses |
| **D**enial of service | Credential stuffing, upload flood | `LoginThrottle` (5/15 min) plus token bucket (30/min scans, 5/min login), 50 MiB payload cap, streaming hash |
| **E**levation of privilege | `user` token attempts admin delete | Hapi `access.scope` on `DELETE /scans/{id}`; tokens carry `["user"]` or `["user","admin"]` |

## Top attacks and what stops them

1. **Credential stuffing / password spraying.** Argon2id at the OWASP floor makes
   each guess expensive; `LoginThrottle` blocks after 5 failures per e-mail and
   per IP for 15 minutes; the token bucket adds 5 requests/min per IP on
   `/auth/login`; unknown e-mails pay the same KDF (`verifyDummyPassword`) and
   return the same `invalid_credentials` body as a wrong password.
   Limitation: both counters are per process, so replicas each have a budget.
2. **Refresh-token theft and replay.** The token is 256 random bits, stored only
   as sha256, delivered in `HttpOnly; SameSite=Strict; Path=/auth` (and `Secure`
   in production). Every refresh rotates it in a transaction; replaying an
   already-rotated token revokes the whole family and logs
   `refresh_token_reuse`. The cost is that a legitimate double-refresh also
   trips it; the user logs in again.
3. **Malicious or oversized upload.** `POST /scans` streams
   `application/octet-stream` into `scanStream`, hashes and discards the bytes,
   caps the body at 50 MiB, and admits 30 requests/min per user/IP. The server
   never parses the uploaded format.
4. **SQL injection.** No string interpolation reaches SQL: Kysely binds every
   value, analytics SQL is static files, and a grep gate keeps `selectFrom`/
   `insertInto`/`.query(` inside `src/db/`. Request values are constrained by Joi
   first.
5. **XSS and clickjacking against the API origin.** `Content-Security-Policy:
   default-src 'none'`, `X-Frame-Options: DENY`, `nosniff` and a strict referrer
   policy; the client never stores tokens in `localStorage` (the refresh token
   is `HttpOnly`).
6. **Secret leak from the process environment.** The pepper and JWT secret are
   the two that change the blast radius; see `secrets.md` for rotation and what
   a leak costs. Logs redact `authorization`, `cookie` and `set-cookie`.

## OWASP Top 10 mapping

| Item | Control here | Status |
|---|---|---|
| A01 Broken Access Control | JWT strategy + route scopes; admin-only delete; `requestor` on upload | **Partial** — any authenticated user can read/cancel any scan; per-object ownership is not implemented |
| A02 Cryptographic Failures | Argon2id + pepper, sha256 refresh tokens, HSTS, no secrets in responses/logs | Covered |
| A03 Injection | Kysely parameters, static SQL files, Joi validation, no `eval`/dynamic SQL | Covered |
| A04 Insecure Design | Threat model, scan state machine, refresh reuse detection, explicit non-goals | Covered (this document) |
| A05 Security Misconfiguration | Fail-fast env contract, CORS allowlist (no `*`), security headers, pino redaction | Covered |
| A06 Vulnerable and Outdated Components | Lockfile pinned, Node 20/kysely pins documented; no automated `pnpm audit` gate or Dependabot yet | **Partial** |
| A07 Identification and Authentication Failures | Argon2id, uniform login errors, throttling, short JWT, rotation/reuse detection | Covered |
| A08 Software and Data Integrity Failures | Lockfile + reviewed install scripts (`allowBuilds`); no artifact signing | Out of scope for M4 |
| A09 Security Logging and Monitoring Failures | Structured pino logs with request ids, `refresh_token_reuse` and internal-error events; no SIEM/alerting | Out of scope for M4 |
| A10 Server-Side Request Forgery | No outbound URL fetchers exist yet (`feed`/`snapshot` adapters unimplemented) | Not applicable yet; revisit with provider ports |

## Non-goals (decisions, not oversights)

- **WAF / DDoS scrubbing.** Deployed behind a provider later; the app-level
  token bucket is abuse control, not DDoS protection.
- **mTLS or service mesh.** One process, one database.
- **External secret manager.** The deployment platform injects environment
  variables; `env.ts` validates them at boot.
- **Encryption at rest / column encryption.** Delegated to managed PostgreSQL.
  Password hashes and token digests are already one-way.
- **Per-object authorization for scans.** The matrix pins the current rule
  (authenticated read/cancel, admin delete); ownership needs a product decision.
- **Multi-replica rate limiting and login throttling.** Both are in-memory with
  Redis-shaped seams (`RateLimiter`, `LoginThrottle`).
- **Immutable audit trail.** `refresh_token_reuse` and 5xx logs are events, not
  a tamper-evident table.
- **Dependency scanning.** No `pnpm audit`/Dependabot gate yet (A06 gap).
- **Python app.** Its `NEWSLETTER_*`, provider keys and file-backed store are
  outside this model.

## References

- [OWASP Top 10 (2021)](https://owasp.org/Top10/)
- [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/)
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
- `docs/security/passwords.md`, `docs/security/sessions.md`, `docs/security/secrets.md`
