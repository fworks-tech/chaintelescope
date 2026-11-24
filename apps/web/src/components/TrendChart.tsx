import type { JSX } from "react";
import { Box, Card, CardContent, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { chartTokens } from "../theme.ts";
import { shortDate, type TrendPoint } from "../lib/trend.ts";

const compactFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const priceFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

interface TrendChartProps {
  readonly points: readonly TrendPoint[];
  readonly asset: string;
  readonly source: string;
  /** e.g. "30-day window" — derived from the fetched window, never literal. */
  readonly windowCaption: string;
}

/**
 * Price + trend chart card. Own file so the dashboard lazy-loads it behind
 * the skeleton (recharts stays out of the initial chunk).
 */
export default function TrendChart({
  points,
  asset,
  source,
  windowCaption,
}: TrendChartProps): JSX.Element {
  const mui = useTheme();
  return (
    <Card className="lg:col-span-2">
      <CardContent>
        <Stack
          direction="row"
          sx={{
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <Box>
            <Typography variant="h5" component="h2">
              Price trend
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
              {asset} · {windowCaption} · {source}
            </Typography>
          </Box>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center", pt: 0.5 }}>
            <LegendKey color={mui.palette.primary.main} label="Price" />
            <LegendKey color={chartTokens.trend} label="Trend" dashed />
          </Stack>
        </Stack>

        <Box sx={{ mt: 2, mx: -1 }}>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart
              data={points}
              margin={{ top: 12, right: 8, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={mui.palette.primary.main}
                    stopOpacity={0.22}
                  />
                  <stop
                    offset="100%"
                    stopColor={mui.palette.primary.main}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={chartTokens.grid} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tickLine={false}
                axisLine={false}
                minTickGap={40}
                tick={{ fontSize: 11, fill: chartTokens.tick }}
                tickMargin={8}
              />
              <YAxis
                domain={["auto", "auto"]}
                /* Padding keeps the top tick label off the SVG edge. */
                padding={{ top: 12, bottom: 4 }}
                width={52}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: chartTokens.tick }}
                tickFormatter={(value: number) => compactFormat.format(value)}
              />
              <Tooltip
                cursor={{ stroke: chartTokens.trend, strokeDasharray: "3 3" }}
                contentStyle={{
                  borderRadius: 10,
                  border: `1px solid ${mui.palette.divider}`,
                  boxShadow: "0 12px 28px rgba(16, 24, 40, 0.12)",
                  fontSize: 12,
                  padding: "8px 12px",
                }}
                labelStyle={{
                  color: mui.palette.text.secondary,
                  fontWeight: 600,
                  marginBottom: 4,
                }}
                itemStyle={{ padding: 0 }}
                labelFormatter={(label) => shortDate(String(label ?? ""))}
                formatter={(value, name) => [
                  priceFormat.format(Number(value)),
                  String(name),
                ]}
              />
              <Area
                type="monotone"
                dataKey="price"
                name="Price"
                stroke={mui.palette.primary.main}
                strokeWidth={2.4}
                fill="url(#priceFill)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "#ffffff" }}
              />
              <Line
                type="monotone"
                dataKey="trend"
                name="Trend"
                stroke={chartTokens.trend}
                strokeWidth={1.6}
                strokeDasharray="5 5"
                dot={false}
                activeDot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </Box>
      </CardContent>
    </Card>
  );
}

function LegendKey({
  color,
  label,
  dashed = false,
}: {
  readonly color: string;
  readonly label: string;
  readonly dashed?: boolean;
}): JSX.Element {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
      <Box
        aria-hidden="true"
        sx={{
          width: 18,
          height: 0,
          borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}`,
        }}
      />
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
    </Stack>
  );
}
