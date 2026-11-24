import type { JSX } from "react";
import { Box, Card, CardContent, Stack, Typography } from "@mui/material";
import { numericFont } from "../theme.ts";
import { priceFormat } from "../lib/format.ts";
import type { TrendSummary } from "../lib/trend.ts";

/** Derived-numbers panel; same observations the chart renders, no new fetch. */
export default function WindowSummary({
  summary,
  window,
  source,
}: {
  readonly summary: TrendSummary;
  readonly window: string;
  readonly source: string;
}): JSX.Element {
  return (
    <Card>
      <CardContent sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <Typography variant="h5" component="h2">
          Window summary
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
          Derived from the same {summary.count} observations.
        </Typography>
        <Stack
          component="dl"
          spacing={1.5}
          sx={{
            mt: 2,
            mb: 0,
            flex: 1,
            justifyContent: "space-between",
            "& > div": {
              display: "flex",
              justifyContent: "space-between",
              gap: 2,
            },
          }}
        >
          <SummaryRow label="Average" value={priceFormat.format(summary.average)} />
          <SummaryRow
            label="Daily volatility"
            value={`${summary.volatility.toFixed(2)}%`}
          />
          <SummaryRow label="High–low range" value={`${summary.rangePct.toFixed(2)}%`} />
          <SummaryRow label="Observations" value={String(summary.count)} />
          <SummaryRow label="Window" value={window} />
          <SummaryRow label="Source" value={source} />
        </Stack>
      </CardContent>
    </Card>
  );
}

function SummaryRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): JSX.Element {
  return (
    <Box>
      <Typography component="dt" variant="body2" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0, fontWeight: 600, ...numericFont }}>
        {value}
      </Typography>
    </Box>
  );
}
