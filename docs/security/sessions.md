# Sessions and tokens

The API splits credentials the way the threat model wants them: a short JWT that
the client sends on every request, and a long opaque refresh token that only
ever travels in an `HttpOnly` cookie scoped to `/auth`.

## Why not the reverse

A JWT cannot be revoked without a server-side list, so putting the long-lived
credential in it hands an attacker a week of access after one theft. The
refresh token is a random 256-bit value with a row in `refresh_tokens`; the
server can revoke it any time. The JWT stays short (15 min default) precisely
because it is the token the server cannot take back.

## Access token

- HS256, signed with `JWT_ACCESS_SECRET` (≥ 32 characters, validated at boot).
- Claims: `sub` (user UUID), `scope` (`["user"]` or `["user","admin"]`), `jti`.
  No e-mail, no name, nothing that would make the token a profile.
- TTL from `JWT_ACCESS_TTL` (`15m` by default), parsed by `parseTtlSeconds`.
- Verified by the `jwt` auth strategy in `apps/api/src/auth/strategy.ts`.
  Missing or invalid credentials → `401` with `WWW-Authenticate: Bearer`.
- Route authorization uses Hapi's `auth.access.scope`; a valid token without
  the scope gets `403` (identity is known, permission is not).

## Refresh token

- Random 32 bytes, base64url. Only `sha256(token)` goes to the database; a dump
  of `refresh_tokens` does not yield a usable token.
- One row per issuance: `family_id` groups a login's rotation chain,
  `rotated_from` points at the previous row, and `rotated_at`/`revoked_at`
  record lifecycle.
- Cookie: `HttpOnly`, `SameSite=Strict`, `Path=/auth`, `Secure` in production
  only (the dev server is HTTP). `POST /auth/refresh` reads it, not a body.

## Rotation and reuse detection

`POST /auth/refresh` runs in one transaction (`AuthRepo.rotateRefreshToken`):
locks the row with `FOR UPDATE`, marks it rotated, inserts its successor in the
same family. A valid row is one that is neither rotated, revoked, nor expired.

Presenting an already-rotated token means one of two clients has a copy the
server never gave it. The whole family is revoked immediately, the attempt is
logged with the `refresh_token_reuse` tag, and the caller gets `401`. That kills
the thief's token and the victim's current one; the victim logs in again. This
is intentionally strict: two tabs refreshing concurrently will trip it.

Logout revokes every row in the family, so the cookie stops working before it
expires.

## Endpoints

| Method | Path             | Result                                                                                  |
| ------ | ---------------- | --------------------------------------------------------------------------------------- |
| `POST` | `/auth/register` | `201` public user; `409 duplicate_email`                                                |
| `POST` | `/auth/login`    | `200` access token + refresh cookie; `401 invalid_credentials`; `429 too_many_attempts` |
| `POST` | `/auth/refresh`  | `200` new access token + rotated cookie; `401` on invalid/revoked/reused                |
| `POST` | `/auth/logout`   | `204`, family revoked and cookie cleared                                                |
| `GET`  | `/auth/me`       | `200` public user; `401` without a valid bearer token                                   |

## Operational limits

- `LoginThrottle` is in-memory and per process (5 failures / 15 minutes per
  e-mail and per IP). Multiple API replicas each have their own counters; a
  shared store is a separate chore.
- Rotation and reuse detection need the database, so they are multi-replica
  correct: every instance sees the same `rotated_at`.
- No endpoint returns `password_hash`, `token_hash`, or the refresh token body.
