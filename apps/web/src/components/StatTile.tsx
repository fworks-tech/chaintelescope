import type { JSX } from "react";
import { Box, Card, CardContent, Typography } from "@mui/material";
import { numericFont } from "../theme.ts";

export type StatTone = "neutral" | "up" | "down";

interface StatTileProps {
  /** Short uppercase label, e.g. "Latest price". */
  readonly label: string;
  /** Pre-formatted value — formatting belongs to the page, not the tile. */
  readonly value: string;
  /** Secondary line: unit, comparison, or method. */
  readonly hint?: string;
  readonly tone?: StatTone;
}

const toneColor: Record<StatTone, string> = {
  neutral: "text.secondary",
  up: "success.dark",
  down: "error.dark",
};

/** Arrow glyphs so direction survives color blindness and grayscale printing. */
const toneGlyph: Record<StatTone, string> = {
  neutral: "",
  up: "▲",
  down: "▼",
};

/**
 * One KPI figure. Mirrors the Streamlit `kpi_row` card (caption / value /
 * delta) with the value scale and tabular digits the mockup needs.
 */
export default function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
}: StatTileProps): JSX.Element {
  return (
    <Card>
      <CardContent>
        <Typography
          component="p"
          sx={{
            fontSize: "0.6875rem",
            fontWeight: 600,
            letterSpacing: "0.09em",
            textTransform: "uppercase",
            color: "text.secondary",
            lineHeight: 1.4,
          }}
        >
          {label}
        </Typography>
        <Typography
          component="p"
          sx={{
            mt: 0.75,
            fontSize: "1.625rem",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            color: "text.primary",
            ...numericFont,
          }}
        >
          {value}
        </Typography>
        {hint ? (
          <Typography
            component="p"
            sx={{
              mt: 0.5,
              fontSize: "0.8125rem",
              fontWeight: tone === "neutral" ? 500 : 600,
              color: toneColor[tone],
              ...numericFont,
            }}
          >
            {toneGlyph[tone] ? (
              <Box
                component="span"
                aria-hidden="true"
                sx={{ mr: 0.5, fontSize: "0.75em" }}
              >
                {toneGlyph[tone]}
              </Box>
            ) : null}
            {hint}
          </Typography>
        ) : null}
      </CardContent>
    </Card>
  );
}
