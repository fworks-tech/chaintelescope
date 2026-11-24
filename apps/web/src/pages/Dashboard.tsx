import { useEffect, useMemo, useState } from "react";
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

  if (error) return <p role="alert">Price trend unavailable: {error}</p>;
  if (!trend) return <p>Loading price trend…</p>;

  const first = trend.prices[0] ?? 0;
  const last = trend.prices[trend.prices.length - 1] ?? 0;
  const change = first === 0 ? 0 : ((last - first) / first) * 100;

  return (
    <section>
      <h1>
        {trend.asset} · {trend.source}
      </h1>
      <dl>
        <div>
          <dt>Latest</dt>
          <dd>{last.toFixed(2)}</dd>
        </div>
        <div>
          <dt>30-day change</dt>
          <dd>
            {change >= 0 ? "+" : ""}
            {change.toFixed(2)}%
          </dd>
        </div>
        <div>
          <dt>Points</dt>
          <dd>{trend.prices.length}</dd>
        </div>
      </dl>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" minTickGap={48} tick={{ fontSize: 12 }} />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fontSize: 12 }}
            tickFormatter={(v: number) => v.toLocaleString()}
          />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="price"
            dot={false}
            strokeWidth={2}
            name={`${trend.asset} price`}
          />
          <Line
            type="monotone"
            dataKey="trend"
            dot={false}
            strokeDasharray="5 5"
            strokeWidth={1}
            name="trend"
          />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}
