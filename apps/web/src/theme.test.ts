import { createTheme } from "@mui/material/styles";
import { describe, expect, it } from "vitest";
import { chartTokens, theme } from "./theme.ts";

/** Guards the Streamlit port (styles.py tokens + chart_theme.py colors). */
describe("theme tokens", () => {
  it("keeps the documented palette values", () => {
    expect(theme.palette.primary.main).toBe("#3b5bff");
    expect(theme.palette.success.dark).toBe("#067647");
    expect(theme.palette.error.dark).toBe("#b42318");
    expect(theme.palette.background.default).toBe("#eef2f8");
    expect(theme.palette.text.primary).toBe("#0f172a");
    expect(theme.palette.text.secondary).toBe("#566275");
    expect(theme.palette.divider).toBe("#d8dee9");
  });

  it("exposes the chart colors in one place", () => {
    expect(chartTokens).toEqual({
      grid: "#e2e8f0",
      tick: "#566275",
      trend: "#94a3ff",
    });
  });

  it("merges with createTheme defaults without dropping tokens", () => {
    const rebuilt = createTheme({
      palette: { primary: { main: theme.palette.primary.main } },
    });
    expect(rebuilt.palette.primary.main).toBe("#3b5bff");
  });
});
