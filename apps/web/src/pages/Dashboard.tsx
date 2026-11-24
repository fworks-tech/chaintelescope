import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import {
  Alert,
  AlertTitle,
  Button,
  Card,
  CardContent,
  Skeleton,
} from "@mui/material";
import type { PriceTrend, TimeWindow } from "@chaintelescope/shared";
import { ApiError, getPriceTrend } from "../api/client.js";
import {
  longDate,
  shortDate,
  summarizeTrend,
  toPoints,
  windowDays,
} from "../lib/trend.ts";
import PageHeader from "../components/PageHeader.tsx";
import StatTile from "../components/StatTile.tsx";
import WindowSummary from "../components/WindowSummary.tsx";

const TrendChart = lazy(() => import("../components/TrendChart.tsx"));

const priceFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Single source for every "30-day" string on this screen. */
const WINDOW: TimeWindow = "30D";
const DAYS = windowDays(WINDOW);

type TrendState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly data: PriceTrend }
  | { readonly status: "error"; readonly message: string };

export default function Dashboard(): JSX.Element {
  const [state, setState] = useState<TrendState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPriceTrend("BTC", WINDOW)
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

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  };

  if (state.status === "error") {
    return <ErrorView message={state.message} onRetry={retry} />;
  }
  if (state.status === "loading") {
    return <LoadingView />;
  }
  return <ReadyView data={state.data} />;
}

function ErrorView({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}): JSX.Element {
  return (
    <>
      <PageHeader title="Market dashboard" />
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={onRetry}>
            Try again
          </Button>
        }
      >
        <AlertTitle>Price trend unavailable</AlertTitle>
        {message}
      </Alert>
    </>
  );
}

function LoadingView(): JSX.Element {
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

function ReadyView({ data }: { readonly data: PriceTrend }): JSX.Element {
  const points = useMemo(() => toPoints(data), [data]);
  const summary = useMemo(
    () => summarizeTrend(data.prices, points),
    [data, points],
  );
  const lastDateLabel = longDate(summary.lastDate) || "—";

  return (
    <>
      <PageHeader
        title="Market dashboard"
        caption={`Tracking ${data.asset} over ${DAYS} days from ${data.source}. Last data point ${lastDateLabel}.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Latest price"
          value={priceFormat.format(summary.last)}
          hint={`USD · ${shortDate(summary.lastDate)}`}
        />
        <StatTile
          label={`${DAYS}-day change`}
          value={`${summary.isUp ? "+" : ""}${summary.change.toFixed(2)}%`}
          hint={`${summary.isUp ? "+" : ""}${priceFormat.format(summary.last - (data.prices[0] ?? 0))} since ${shortDate(points[0]?.date ?? "")}`}
          tone={summary.isUp ? "up" : "down"}
        />
        <StatTile
          label={`${DAYS}-day high`}
          value={priceFormat.format(summary.high)}
          hint={`on ${shortDate(summary.highDate)}`}
        />
        <StatTile
          label={`${DAYS}-day low`}
          value={priceFormat.format(summary.low)}
          hint={`on ${shortDate(summary.lowDate)}`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Suspense
          fallback={
            <Card className="lg:col-span-2">
              <CardContent>
                <Skeleton variant="rounded" height={372} />
              </CardContent>
            </Card>
          }
        >
          <TrendChart
            points={points}
            asset={data.asset}
            source={data.source}
            windowCaption={`${DAYS}-day window`}
          />
        </Suspense>
        <WindowSummary summary={summary} window={WINDOW} source={data.source} />
      </div>
    </>
  );
}
