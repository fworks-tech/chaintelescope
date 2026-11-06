# Secrets handling

Every variable below is read by `apps/api/src/env.ts` and validated at boot. The
process does not load a `.env` file by itself: the platform injects environment
variables, and `node --env-file` is only a local convenience.

Nothing in this document is a real value. The values in `.env.example`, CI and
the tests are non-production fixtures and must never be reused.

## Inventory

| Variable | Secret? | Read by | Why | Rotation |
|---|---|---|---|---|
| `DATABASE_URL` | **Yes** (contains the DB password) | `db/pool.ts`, `db/migrate.ts` | Authenticates to PostgreSQL; includes the password | Change the role password, update the secret, rolling restart |
| `JWT_ACCESS_SECRET` | **Yes** | `auth/tokens.ts` (`signAccessToken`), `auth/strategy.ts` | HS256 key for access tokens; a holder can forge `admin` tokens | Set a new value, deploy. Old access tokens fail for at most `JWT_ACCESS_TTL` (15 min) |
| `ARGON2_PEPPER` | **Yes, critical** | `auth/password.ts` (via `routes.ts`) | Mixed into every password before Argon2id; a stolen database alone is not enough to attack hashes offline | Requires a code change or a forced reset; see below |
| `CORS_ORIGINS` | No (integrity-sensitive) | `server.ts` | Browser allowlist; a wrong value breaks or widens the client surface | Update, deploy; `*` is refused at boot |
| `JWT_ACCESS_TTL` | No | `auth/session.ts`, `env.ts` | Access-token lifetime | Change and deploy; existing tokens keep their `exp` |
| `JWT_REFRESH_TTL_DAYS` | No | `auth/session.ts` | Lifetime of newly issued refresh tokens | Change and deploy; existing rows keep `expires_at` |
| `NODE_ENV` | No | `server.ts`, logging, cookie `Secure` | Selects production behaviour (Secure cookie) | Platform setting |
| `HOST`, `PORT` | No | `server.ts` | Listener bind | Platform setting |
| `SCAN_DAEMON_ENABLED` | No | `server.ts` | Registers the scan daemon when a source adapter exists | Runtime config |
| `SCAN_POLL_INTERVAL_MS`, `SCAN_CONCURRENCY` | No | `scans/plugin.ts` | Daemon polling and parallelism | Runtime config |

The Python app's `NEWSLETTER_*`, provider keys and file-backed store are a
separate, frozen surface and are not covered here.

## Generation

```powershell
# ARGON2_PEPPER: 32 bytes -> exactly 64 hex characters
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"

# JWT_ACCESS_SECRET: at least 32 characters; base64url avoids shell quoting
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

`env.ts` enforces the pepper's 64-hex shape and a minimum length of 32 for the
JWT secret. A malformed value stops the boot instead of failing at the first
login.

## Storage rules

- Production values live only in the platform secret store, injected as
  environment variables. Never in git, a Docker image layer, a log line, a
  ticket, or a chat message.
- `.env` and `.streamlit/secrets.toml` are gitignored; `.env.example` contains
  placeholders only.
- CI uses fixture values. A production pepper or JWT secret in CI is a leak.
- The pino logger redacts `authorization`, `cookie` and `set-cookie`; `server.ts`
  never logs configuration values.
- Rotate on any suspected exposure, and on personnel changes for the platform
  account that can read the secret store.

## If the pepper leaks

The pepper is the only secret that makes a database dump insufficient for
offline password cracking. Two cases:

- **Pepper alone leaks.** An attacker cannot verify guesses without the stored
  hashes. Rotate it before the next deploy. Because the code only holds one
  pepper, every existing hash becomes unverifiable at that moment.
- **Pepper and database leak together.** Offline Argon2id cracking is possible,
  slowed by `m=19456, t=2, p=1` but not prevented for weak passwords. Rotate the
  pepper, force a password reset for every account, and review sign-in logs.

Rotation procedure for the current single-pepper implementation:

1. Pick a cutover: (a) dual-read window — deploy code that verifies with the old
   pepper and re-hashes with the new one on successful login, then remove the
   old pepper; or (b) force reset — invalidate every `users.password_hash` and
   require a reset. Neither is implemented today.
2. Set the new `ARGON2_PEPPER`, deploy, and confirm a login re-hashes
   (`needsUpgrade` / `password_hash` changes).
3. Destroy the old value from the secret store and any backup.

There is no password-reset endpoint yet, so option (b) currently means an
operator-assisted reset. That is a gap to close before production.

## If the JWT secret leaks

A holder can sign any `sub`/`scope` pair, including `admin`, until rotation.
Rotate immediately:

1. Generate a new secret, update the secret store, rolling restart.
2. Access tokens signed with the old secret fail (at most 15 minutes of user
   friction). No dual-secret verification is implemented; add an old-secret
   fallback first if a zero-downtime rotation is required.
3. Refresh tokens are opaque database rows and are unaffected. A client with a
   valid refresh cookie recovers automatically on the next refresh.
4. Revoke refresh families for any account suspected of compromise (`logout`
   revokes the current family; there is no admin-wide revoke endpoint yet).

## If `DATABASE_URL` leaks

Assume full read/write on the database: password hashes (peppered), refresh
token digests (not usable directly), newsletter e-mails, scan metadata.

1. Change the role password (`ALTER ROLE ... PASSWORD ...`), update the secret,
   rolling restart.
2. Kill existing sessions for that role (`pg_terminate_backend`).
3. Revoke all refresh tokens (`UPDATE refresh_tokens SET revoked_at = now()`
   where `revoked_at IS NULL`) so stolen cookies cannot mint new access tokens.
4. For a full compromise, treat the pepper as leaked too.

The runtime currently uses the same `DATABASE_URL` for migrations as for
queries; a least-privilege app role (no DDL) is not implemented.

## Local and CI

```powershell
# local API
$env:DATABASE_URL = "postgres://postgres:postgres@localhost:55432/chaintelescope_test"
$env:ARGON2_PEPPER = "<64 hex chars>"
$env:JWT_ACCESS_SECRET = "<32+ chars>"
$env:CORS_ORIGINS = "http://localhost:3000,http://localhost:8501"
node --env-file=apps/api/.env apps/api/dist/main.js
```

The integration suites skip without `DATABASE_URL`; `server.test.ts`,
`auth-session.test.ts`, `scans-routes.test.ts`, `matrix.test.ts` and the
security suites set fixture values before importing `env.ts`. Those fixtures are
public and must stay non-production.

## Related

- `docs/security/threat-model.md` — assets, boundaries, attacks, OWASP mapping
- `docs/security/passwords.md` — Argon2id parameters and policy
- `docs/security/sessions.md` — access/refresh split, rotation, reuse detection
