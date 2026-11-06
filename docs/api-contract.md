# API contract

The canonical description of the HTTP surface is generated, not written by hand:

- `packages/openapi/openapi.json` — OpenAPI 3.0 document produced from the Hapi route table and the Joi schemas in `packages/shared/src/validation.ts`.
- `apps/api/test/matrix.test.ts` — the status matrix: every route × anonymous/user/admin/invalid payload/missing resource/conflict, with the route list cross-checked against `server.table()` so a new route without a row fails the suite.

Regenerate the document with:

```powershell
pnpm api:openapi          # builds shared + api, then writes packages/openapi/openapi.json
pnpm api:openapi:check    # fails if regeneration changes the committed file
```

CI (`build` job) runs the generator after `pnpm -r build` and fails on `git diff`, so the committed document cannot drift from the routes.

## Auth model

| Surface                                                          | Requirement                                                 |
| ---------------------------------------------------------------- | ----------------------------------------------------------- |
| `/healthz`                                                       | public                                                      |
| `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` | public (cookie for refresh/logout)                          |
| `/auth/me`                                                       | `user` or `admin` bearer token                              |
| `/scans`, `/scans/{id}`, `/scans/{id}/cancel`                    | bearer token; `requestor` is the token subject on upload    |
| `DELETE /scans/{id}`                                             | `admin` scope (`403 insufficient_scope` for a `user` token) |
| `/newsletter/subscribe`                                          | public; duplicate e-mail is `409`                           |

## Status matrix

| Route                        | Anonymous | User | Admin | Invalid payload | Missing resource | Conflict |
| ---------------------------- | --------- | ---- | ----- | --------------- | ---------------- | -------- |
| `GET /healthz`               | 200       | —    | —     | —               | —                | —        |
| `POST /auth/register`        | 201       | —    | —     | 422             | —                | 409      |
| `POST /auth/login`           | 200       | —    | —     | 422             | —                | 401      |
| `POST /auth/refresh`         | 401       | 200  | —     | 401             | —                | —        |
| `POST /auth/logout`          | 204       | 204  | —     | —               | —                | —        |
| `GET /auth/me`               | 401       | 200  | 200   | —               | —                | —        |
| `POST /scans`                | 401       | 201  | 201   | 415             | —                | —        |
| `GET /scans`                 | 401       | 200  | 200   | 400 (cursor)    | —                | —        |
| `GET /scans/{id}`            | 401       | 200  | 200   | —               | 404              | —        |
| `POST /scans/{id}/cancel`    | 401       | 202  | —     | —               | 404              | 409      |
| `DELETE /scans/{id}`         | 401       | 403  | 204   | —               | 404              | —        |
| `POST /newsletter/subscribe` | 201       | 201  | —     | 422             | —                | 409      |

Every `429` from the token bucket (`#121`) is outside this matrix; it is covered by `test/rate-limit.test.ts` with a frozen clock. Every error body follows `{ error: { code, message, requestId }, details? }` from `#118`.

## Not registered

- `GET /api/news` — the ingest exists but has no scheduler (#109), and the Node schema lacks the Python response's `source`/`tags`.
- `GET /api/snapshot` — blocked on the market-provider port.
- `GET /api/newsletter/subscriptions` — the Python version lists every subscriber e-mail; not exposed.

These are marked blocked in `docs/port-inventory.md` rather than stubbed.
