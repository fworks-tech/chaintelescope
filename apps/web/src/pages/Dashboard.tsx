import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  CardContent,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
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
import type { PriceTrend } from "@chaintelescope/shared";
import { ApiError, getPriceTrend } from "../api/client.js";
import PageHeader from "../components/PageHeader.tsx";
import StatTile from "../components/StatTile.tsx";
import { numericFont, theme } from "../theme.ts";

interface TrendPoint {
  readonly date: string;
  readonly price: number;
  readonly trend: number;
}

const priceFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const compactFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const shortDateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const longDateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function toPoints(data: PriceTrend): TrendPoint[] {
  return data.prices.map((price, i) => ({
    date: (data.dates[i] ?? "").slice(0, 10),
    price,
    trend: data.trend[i] ?? price,
  }));
}

function shortDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? value : shortDateFormat.format(parsed);
}

/** Standard deviation of daily percentage returns, in percent. */
function dailyVolatility(prices: readonly number[]): number {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i += 1) {
    const prev = prices[i - 1];
    const next = prices[i];
    if (prev && next) returns.push((next - prev) / prev);
  }
  if (returns.length < 2) return 0;
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * 100;
}

type TrendState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: PriceTrend }
  | { readonly status: "error"; readonly message: string };

export default function Dashboard(): JSX.Element {
  const [state, setState] = useState<TrendState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPriceTrend()
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            err instanceof ApiError
              ? `API ${err.status}: ${err.message}`
              : "API unreachable",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const points = useMemo(
    () => (state.status === "ready" ? toPoints(state.data) : []),
    [state],
  );

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  };

  if (state.status === "error") {
    return (
      <>
        <PageHeader title="Market dashboard" />
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={retry}>
              Try again
            </Button>
          }
        >
          <AlertTitle>Price trend unavailable</AlertTitle>
          {state.message}
        </Alert>
      </>
    );
  }

  if (state.status === "loading") {
    return (
      <>
        <PageHeader
          title="Market dashboard"
          caption="Loading the latest price trend…"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <Card key={key}>
              <CardContent>
                <Skeleton width="55%" height={14} />
                <Skeleton width="75%" height={38} sx={{ mt: 1 }} />
                <Skeleton width="40%" height={16} />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Skeleton width="30%" height={22} />
            <Skeleton width="50%" height={14} sx={{ mt: 1 }} />
            <Skeleton variant="rounded" height={300} sx={{ mt: 2 }} />
          </CardContent>
        </Card>
      </>
    );
  }

  const { data } = state;
  const first = data.prices[0] ?? 0;
  const last = data.prices[data.prices.length - 1] ?? 0;
  const change = first === 0 ? 0 : ((last - first) / first) * 100;
  const up = change >= 0;
  const high = data.prices.length ? Math.max(...data.prices) : 0;
  const low = data.prices.length ? Math.min(...data.prices) : 0;
  const average =
    data.prices.length > 0
      ? data.prices.reduce((sum, p) => sum + p, 0) / data.prices.length
      : 0;
  const volatility = dailyVolatility(data.prices);
  const rangePct = low === 0 ? 0 : ((high - low) / low) * 100;
  const lastDate = points[points.length - 1]?.date ?? "";
  const highDate = points[data.prices.indexOf(high)]?.date ?? "";
  const lowDate = points[data.prices.indexOf(low)]?.date ?? "";

  return (
    <>
      <PageHeader
        title="Market dashboard"
        caption={`Tracking ${data.asset} over 30 days from ${data.source}. Last data point ${
          lastDate ? longDateFormat.format(new Date(`${lastDate}T00:00:00Z`)) : "—"
        }.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Latest price"
          value={priceFormat.format(last)}
          hint={`USD · ${shortDate(lastDate)}`}
        />
        <StatTile
          label="30-day change"
          value={`${up ? "+" : ""}${change.toFixed(2)}%`}
          hint={`${up ? "+" : ""}${priceFormat.format(last - first)} since ${shortDate(
            points[0]?.date ?? "",
          )}`}
          tone={up ? "up" : "down"}
        />
        <StatTile
          label="30-day high"
          value={priceFormat.format(high)}
          hint={`on ${shortDate(highDate)}`}
        />
        <StatTile
          label="30-day low"
          value={priceFormat.format(low)}
          hint={`on ${shortDate(lowDate)}`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
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
                  {data.asset} · 30-day window · {data.source}
                </Typography>
              </Box>
              <Stack direction="row" spacing={2} sx={{ alignItems: "center", pt: 0.5 }}>
                <LegendKey color={theme.palette.primary.main} label="Price" />
                <LegendKey color="#94a3ff" label="Trend" dashed />
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
                        stopColor={theme.palette.primary.main}
                        stopOpacity={0.22}
                      />
                      <stop
                        offset="100%"
                        stopColor={theme.palette.primary.main}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={shortDate}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={40}
                    tick={{ fontSize: 11, fill: "#566275" }}
                    tickMargin={8}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    /* Padding keeps the top tick label off the SVG edge. */
                    padding={{ top: 12, bottom: 4 }}
                    width={52}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#566275" }}
                    tickFormatter={(value: number) => compactFormat.format(value)}
                  />
                  <Tooltip
                    cursor={{ stroke: "#94a3ff", strokeDasharray: "3 3" }}
                    contentStyle={{
                      borderRadius: 10,
                      border: `1px solid ${theme.palette.divider}`,
                      boxShadow: "0 12px 28px rgba(16, 24, 40, 0.12)",
                      fontSize: 12,
                      padding: "8px 12px",
                    }}
                    labelStyle={{
                      color: theme.palette.text.secondary,
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
                    stroke={theme.palette.primary.main}
                    strokeWidth={2.4}
                    fill="url(#priceFill)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "#ffffff" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="trend"
                    name="Trend"
                    stroke="#94a3ff"
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

        <Card>
          <CardContent sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Typography variant="h5" component="h2">
              Window summary
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.25, color: "text.secondary" }}>
              Derived from the same {data.prices.length} observations.
            </Typography>
            <Stack
              component="dl"
              spacing={1.5}
              sx={{
                mt: 2,
                mb: 0,
                flex: 1,
                justifyContent: "space-between",
                "& div": {
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 2,
                },
              }}
            >
              <SummaryRow label="Average" value={priceFormat.format(average)} />
              <SummaryRow
                label="Daily volatility"
                value={`${volatility.toFixed(2)}%`}
              />
              <SummaryRow label="High–low range" value={`${rangePct.toFixed(2)}%`} />
              <SummaryRow label="Observations" value={String(data.prices.length)} />
              <SummaryRow label="Window" value="30D" />
              <SummaryRow label="Source" value={data.source} />
            </Stack>
          </CardContent>
        </Card>
      </div>
    </>
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
