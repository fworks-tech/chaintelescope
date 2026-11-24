import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PriceTrend } from "@chaintelescope/shared";
import { ApiError, getPriceTrend } from "../api/client.js";
import { theme } from "../theme.ts";

interface TrendPoint {
  readonly date: string;
  readonly price: number;
  readonly trend: number;
}

function toPoints(data: PriceTrend): TrendPoint[] {
  return data.prices.map((price, i) => ({
    date: (data.dates[i] ?? "").slice(0, 10),
    price,
    trend: data.trend[i] ?? price,
  }));
}

export default function Dashboard() {
  const [trend, setTrend] = useState<PriceTrend | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPriceTrend()
      .then((data) => {
        if (!cancelled) setTrend(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? `API ${err.status}: ${err.message}`
              : "API unreachable",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const points = useMemo(
    () => (trend ? toPoints(trend) : []),
    [trend],
  );

  if (error)
    return <Alert severity="error">Price trend unavailable: {error}</Alert>;
  if (!trend)
    return (
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <CircularProgress size={20} />
        <Typography>Loading price trend…</Typography>
      </Stack>
    );

  const first = trend.prices[0] ?? 0;
  const last = trend.prices[trend.prices.length - 1] ?? 0;
  const change = first === 0 ? 0 : ((last - first) / first) * 100;
  const up = change >= 0;

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Typography variant="h5" component="h1">
            {trend.asset} · {trend.source}
          </Typography>
          <Stack direction="row" spacing={4} sx={{ mt: 1 }}>
            <span>
              <Typography variant="caption" color="text.secondary">
                Latest
              </Typography>
              <Typography variant="h6">{last.toFixed(2)}</Typography>
            </span>
            <span>
              <Typography variant="caption" color="text.secondary">
                30-day change
              </Typography>
              <Typography
                variant="h6"
                color={up ? "success.main" : "error.main"}
              >
                {up ? "+" : ""}
                {change.toFixed(2)}%
              </Typography>
            </span>
            <span>
              <Typography variant="caption" color="text.secondary">
                Points
              </Typography>
              <Typography variant="h6">{trend.prices.length}</Typography>
            </span>
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart
              data={points}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                minTickGap={48}
                tick={{ fontSize: 12, fill: "#475569" }}
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 12, fill: "#475569" }}
                tickFormatter={(v: number) => v.toLocaleString()}
              />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="price"
                dot={false}
                strokeWidth={2}
                stroke={theme.palette.primary.main}
                name={`${trend.asset} price`}
              />
              <Line
                type="monotone"
                dataKey="trend"
                dot={false}
                strokeDasharray="5 5"
                strokeWidth={1}
                stroke="#94a3ff"
                name="trend"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </Stack>
  );
}
