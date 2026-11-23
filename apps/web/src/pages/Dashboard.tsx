import { useEffect, useState } from "react";
import type { PriceTrend } from "@chaintelescope/shared";
import { ApiError, getPriceTrend } from "../api/client.js";

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

  if (error) return <p role="alert">Price trend unavailable: {error}</p>;
  if (!trend) return <p>Loading price trend…</p>;

  return (
    <section>
      <h1>
        {trend.asset} · {trend.prices.length} points · {trend.source}
      </h1>
      <p>
        Latest: {trend.prices[trend.prices.length - 1]?.toFixed(2)} (trend{" "}
        {trend.trend[trend.trend.length - 1]?.toFixed(2)})
      </p>
    </section>
  );
}
