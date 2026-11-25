# @chaintelescope/web

React 19 + Vite shell for the ChainTelescope UI, replacing the Streamlit views
page by page. Stack decision and styling rules live in
[ADR-0009](../../docs/adr/0009-mui-tailwind-ui-stack.md).

## Run

From the repository root:

```bash
pnpm install
pnpm build:shared          # packages/shared must be built before the app typechecks
pnpm --filter @chaintelescope/web dev
```

`/api` is proxied to `http://localhost:3000` in dev (see `vite.config.ts`); set
`VITE_API_BASE_URL` to point at another origin. Same-origin `/api` is the
default; in prod the Vercel rewrite sends `/api/*` to the API origin
(`vercel.json`) — so dev, default and prod can hit three different backends.
When verifying, confirm which backend served the response. Note: every Vercel
preview rewrites to the same prod API — fine for reads, think twice once a
preview can write (newsletter subscribe is public).
Node routes (`/scans`, `/auth/*`, `/newsletter/subscribe`) use
`VITE_NODE_API_BASE_URL` with no same-origin fallback; dev proxies them to
`http://localhost:3000`. They stay dormant until the serving cutover (#210).

## Structure

| Path                            | Role                                                                                                                                                                                                                   |
| :------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/theme.ts`                  | MUI theme: Streamlit tokens, typography scale, component defaults                                                                                                                                                      |
| `src/index.css`                 | Tailwind v4 layers (no preflight) + CSS tokens and global rules                                                                                                                                                        |
| `src/components/Layout.tsx`     | App shell: sticky header, primary nav, page container                                                                                                                                                                  |
| `src/components/PageHeader.tsx` | Title + caption + actions, shared by every screen                                                                                                                                                                      |
| `src/components/StatTile.tsx`   | One KPI figure (label / value / delta)                                                                                                                                                                                 |
| `src/pages/`                    | One file per route; stubs use `Placeholder`                                                                                                                                                                            |
| `src/api/client.ts`             | Typed fetch wrapper over `GET /api/*` plus dormant Node calls (`/scans`, `/auth/*`, `/newsletter/subscribe`, snapshot); parses Boom errors into `HttpApiError`, and `toApiError` returns serializable rejection values |
| `src/store/index.ts`            | Typed Redux Toolkit store (`RootState` / `AppDispatch`)                                                                                                                                                                |
| `src/store/StoreProvider.tsx`   | Single approved React-Redux `Provider` boundary                                                                                                                                                                        |
| `src/store/hooks.ts`            | Only approved `useAppDispatch` / `useAppSelector` hooks                                                                                                                                                                |
| `src/store/news/newsSlice.ts`   | Normalized News entities + abortable `fetchNews` lifecycle                                                                                                                                                             |

## Styling rules

- Component styling through MUI `sx`; layout and spacing through Tailwind
  utilities. No new raw CSS except tokens.
- `Typography`'s `color` prop only accepts `textSecondary`-style keys in MUI v9;
  a dotted path like `color="text.secondary"` silently does nothing. Use
  `sx={{ color: "text.secondary" }}`.
- Semantic colors: `success.dark` / `error.dark` for text, `success.main` /
  `error.main` for fills and chart strokes — `#12b76a` on white is 2.4:1.
- Direction is never color-only: deltas carry an arrow glyph and a sign.

## Gates

```bash
pnpm --filter @chaintelescope/web typecheck
pnpm --filter @chaintelescope/web lint
pnpm --filter @chaintelescope/web test
pnpm --filter @chaintelescope/web build
```
