import type { PriceTrend, TimeWindow } from "@chaintelescope/shared";
import { TIME_WINDOW_DAYS } from "@chaintelescope/shared";

/**
 * Base URL for the API. Dev proxies `/api` to localhost:3000 (vite.config.ts);
 * same-origin `/api` is the default; prod Vercel rewrites `/api/*` to the API
 * origin (vercel.json). Point `VITE_API_BASE_URL` elsewhere to override.
 */
const BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "/api";

/**
 * Hangs are the common failure behind a loading spinner; the market chain
 * already guards slow providers server-side, the UI gets the same treatment.
 */
const REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const res = await fetch(`${BASE_URL}${path}`, { signal: combined });
  if (!res.ok) {
    throw new ApiError(res.status, res.statusText);
  }
  return (await res.json()) as T;
}

/** True for the 15s client timeout — surfaced distinctly from offline. */
export function isTimeout(err: unknown): boolean {
  return err instanceof DOMException && err.name === "TimeoutError";
}

/**
 * Live price trend for one asset. Mirrors Python `GET /api/price-trend`.
 * `days` is derived from the shared window map — never stated twice.
 * Pass an AbortSignal to cancel on unmount; otherwise the request outlives
 * the component (StrictMode remounts double-fire it).
 */
export function getPriceTrend(
  asset = "BTC",
  window: TimeWindow = "30D",
  signal?: AbortSignal,
): Promise<PriceTrend> {
  const params = new URLSearchParams({
    asset,
    window,
    days: String(TIME_WINDOW_DAYS[window]),
  });
  return getJson<PriceTrend>(`/price-trend?${params.toString()}`, signal);
}
