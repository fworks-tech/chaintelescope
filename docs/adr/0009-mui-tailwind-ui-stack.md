# ADR 0009: MUI + Tailwind as the Web UI Stack

**Date:** 2026-11-24
**Status:** Accepted

## Context

`apps/web` renders with unstyled DOM plus a recharts chart (#193 proved the
data path but the page has no visual identity). The Streamlit app owns the
only real design language (`apps/python/src/styles.py` tokens, `chart_theme.py`
grid/font colors). New pages (news, alerts, risk, newsletter) each need cards,
lists, forms, and feedback states — hand-rolled CSS per page would diverge in
weeks.

## Decision

- `@mui/material` (with Emotion) for components: AppBar, Card, Typography,
  Alert, form controls. Theme in `apps/web/src/theme.ts` ported from the
  Streamlit `:root` tokens — 1:1 except the documented AA deviations
  (`text.secondary`, dark text shades, card hairline).
- Tailwind v4 (`@tailwindcss/vite`) for layout utilities only, **without
  preflight**: `index.css` imports just `theme.css` + `utilities.css` layers.
  `CssBaseline` owns the reset — Tailwind preflight breaks MUI components.
- Rule: component styling via MUI `sx`, spacing/layout via Tailwind, no new
  raw CSS except tokens. Recharts keeps its colors from `chart_theme.py`
  (grid `#e2e8f0`, font `#475569`, accent `#3b5bff`).

## Alternatives Considered

| Option | Why Considered | Why Rejected |
|--------|---------------|-------------|
| Hand-rolled CSS | Zero deps, full control | Diverges per page; re-implements Card/Alert/form a11y MUI already ships |
| Tailwind only | Small bundle, utilities fit layout | No accessible component set; forms/alerts/nav rebuilt by hand |
| Full preflight + MUI | Default Tailwind setup | Preflight resets fight `CssBaseline` and MUI internals |

## Consequences

**Positive:** every page shares theme, a11y, and feedback patterns from day
one; Streamlit look carries over via tokens.
**Negative:** bundle grows (MUI + Emotion + recharts); recharts ships as a
lazy `TrendChart` chunk, but the main chunk still trips the >500 kB warning
via MUI — further route-level or import-tuning follow-up stands.
**Neutral:** two styling engines coexist under the rule above.

## References

- #193 (first chart), #134 (chart parity), #135 (dark mode — still out of
  scope; this ADR covers the light theme only)
- `apps/python/src/styles.py`, `apps/python/src/components/chart_theme.py`
