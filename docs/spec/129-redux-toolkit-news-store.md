# Spec: Redux Toolkit News Store Foundation

> Status: Implemented News slice; #129 remains open for the remaining store work.

## Problem

The React News page owns its fetch, loading and error state locally. There is no typed shared store, normalized news state, or consistent `pending` / `fulfilled` / `rejected` contract. Adding Alerts, Newsletter, Risk and scans on the same ad-hoc pattern would duplicate lifecycle logic and make cancellation and server errors inconsistent.

## Proposed Solution

Introduce Redux Toolkit in `apps/web` with a typed `configureStore`, typed hooks, and a normalized News slice. A `fetchNews` async thunk will call the existing typed API client, normalize failures to `{ code, message }`, honor the thunk abort signal, and map `pending` / `fulfilled` / `rejected` actions to `loading` / `idle` / `error` state. The News page will dispatch the thunk, abort it on unmount, and render those states from selectors.

## Out of Scope

- Scans, upload progress, snapshots, auth and newsletter slices.
- Automatic 401 refresh and single-flight token refresh.
- Closing #129; this slice only establishes the pattern and the News flow.
- Visual redesign of the News page beyond lifecycle states.

## Acceptance Criteria

- [x] `RootState` and `AppDispatch` are inferred from `configureStore`; components use only `useAppDispatch` and `useAppSelector`.
- [x] Imports of `useDispatch` / `useSelector` from `react-redux` are banned outside `store/hooks.ts`.
- [x] News uses `createEntityAdapter`; selectors support all items and lookup by id.
- [x] `fetchNews` declares `rejectValue: ApiError` and maps network, HTTP, timeout and abort failures explicitly.
- [x] Pending, fulfilled and rejected thunk actions render a loading skeleton, news items and a typed error banner respectively.
- [x] Unmounting mid-flight aborts the request; the aborted rejection clears the active request without storing an error or replacing entities.
- [x] Dashboard flows and public endpoint contracts remain unchanged; HTTP error copy now uses the normalized server message.

## Testing Strategy

- Vitest + Testing Library store tests for pending/fulfilled/rejected and abort behavior.
- Component tests for loading skeleton, error banner and successful News rendering.
- Web typecheck, lint, build and the existing test suite must pass.
- No API or Python changes are required.

## Open Questions

None. The store shape deliberately starts with News only; later slices follow the same contract.

## Tasks

- [x] `test(web)`: add failing store/component tests for lifecycle, typed errors and abort.
- [x] `feat(web)`: add Redux Toolkit dependencies, typed store/hooks and lint boundary.
- [x] `feat(web)`: add normalized News slice and API error normalization.
- [x] `feat(web)`: wire the provider and News page to the thunk/selectors.
- [x] `docs(web)`: record this slice in the docs index and draft the PR description.
