import { createTheme } from "@mui/material/styles";

/**
 * MUI theme ported from the Streamlit tokens in
 * `apps/python/src/styles.py` (`GLOBAL_STYLE` `:root` block).
 * Single light theme — dark mode is out of scope (see #135).
 */
export const theme = createTheme({
  palette: {
    primary: { main: "#3b5bff" },
    success: { main: "#12b76a" },
    warning: { main: "#f79009" },
    error: { main: "#f04438" },
    background: { default: "#eef2f8", paper: "#ffffff" },
    text: { primary: "#0f172a", secondary: "#64748b" },
    divider: "#d8dee9",
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: "system-ui, sans-serif",
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: "0 8px 24px rgba(16, 24, 40, 0.04)",
        },
      },
    },
  },
});
