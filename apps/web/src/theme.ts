import { createTheme } from "@mui/material/styles";

/**
 * MUI theme ported from the Streamlit tokens in
 * `apps/python/src/styles.py` (`GLOBAL_STYLE` `:root` block).
 * Single light theme — dark mode is out of scope (see #135).
 *
 * Three deliberate deviations from the Streamlit CSS, both accessibility-driven:
 * 1. `success`/`error` keep their bright hues for charts and fills, but text
 *    that carries meaning uses the `dark` shade (`#067647` / `#b42318`), since
 *    `#12b76a` on white is 2.4:1 and fails WCAG AA for body-size text.
 * 2. `text.secondary` is a shade darker than the Streamlit `--muted` so
 *    captions pass AA against the page gradient.
 * 3. Panels get a 1px hairline border in addition to the soft shadow: white
 *    cards on the `#eef2f8` gradient need an edge to read as separate surfaces.
 */

const FONT_STACK = [
  "system-ui",
  "-apple-system",
  '"Segoe UI"',
  "Roboto",
  '"Helvetica Neue"',
  "Arial",
  "sans-serif",
].join(", ");

/** Money/price figures: fixed-width digits so values don't jitter while loading. */
export const numericFont = {
  fontVariantNumeric: "tabular-nums",
  fontFeatureSettings: '"tnum" 1',
} as const;

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#3b5bff",
      dark: "#2f49d8",
      light: "#94a3ff",
      contrastText: "#ffffff",
    },
    success: {
      main: "#12b76a",
      dark: "#067647",
      light: "#d1fadf",
      contrastText: "#ffffff",
    },
    warning: {
      main: "#f79009",
      dark: "#b54708",
      light: "#fef0c7",
      contrastText: "#ffffff",
    },
    error: {
      main: "#f04438",
      dark: "#b42318",
      light: "#fee4e2",
      contrastText: "#ffffff",
    },
    info: { main: "#3b5bff" },
    background: { default: "#eef2f8", paper: "#ffffff" },
    /* `#64748b` (Streamlit `--muted`) is 4.24:1 on the page gradient —
       just under AA. `#566275` keeps the slate tone and clears 4.5:1 on both
       the white paper and the `#eef2f8` background. */
    text: { primary: "#0f172a", secondary: "#566275", disabled: "#94a3b8" },
    divider: "#d8dee9",
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: FONT_STACK,
    h1: {
      fontSize: "1.75rem",
      fontWeight: 700,
      letterSpacing: "-0.03em",
      lineHeight: 1.15,
    },
    h2: {
      fontSize: "1.375rem",
      fontWeight: 700,
      letterSpacing: "-0.02em",
      lineHeight: 1.25,
    },
    h5: {
      fontSize: "1.0625rem",
      fontWeight: 700,
      letterSpacing: "-0.02em",
      lineHeight: 1.3,
    },
    h6: {
      fontSize: "1.5rem",
      fontWeight: 700,
      letterSpacing: "-0.02em",
      lineHeight: 1.2,
      ...numericFont,
    },
    body1: { fontSize: "0.9375rem", lineHeight: 1.55 },
    body2: { fontSize: "0.875rem", lineHeight: 1.5 },
    caption: { fontSize: "0.78125rem", lineHeight: 1.4 },
    button: {
      textTransform: "none",
      fontWeight: 600,
      letterSpacing: 0,
      fontSize: "0.875rem",
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
          textRendering: "optimizeLegibility",
        },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: "inherit" },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme: t }) => ({
          border: `1px solid ${t.palette.divider}`,
          boxShadow: "0 8px 24px rgba(16, 24, 40, 0.04)",
          backgroundImage: "none",
        }),
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: 20,
          "&:last-child": { paddingBottom: 20 },
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 10,
          minHeight: 36,
          paddingInline: 14,
          "&:focus-visible": {
            outline: "2px solid",
            outlineColor: "#3b5bff",
            outlineOffset: 2,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 8 },
        sizeSmall: { fontSize: "0.75rem", height: 24 },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          alignItems: "center",
          "&.MuiAlert-standardError": {
            backgroundColor: "#fee4e2",
            color: "#7a271a",
          },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: "#0f172a",
          fontSize: "0.75rem",
          borderRadius: 8,
          padding: "6px 10px",
        },
      },
    },
    MuiSkeleton: {
      styleOverrides: { root: { borderRadius: 8, backgroundColor: "#e6ecf5" } },
    },
    MuiLink: { defaultProps: { underline: "hover" } },
  },
});

/**
 * Chart colors: same Streamlit `chart_theme.py` source as the palette, kept
 * here (not inline in the chart) so the AA deviations have a single home.
 */
export const chartTokens = {
  grid: "#e2e8f0",
  tick: "#566275",
  trend: "#94a3ff",
} as const;
