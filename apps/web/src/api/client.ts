import type { PriceTrend, TimeWindow } from "@chaintelescope/shared";

/** Base URL for the Hapi API. Relative `/api` by default so same-origin deploys work with no config. */
const BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "/api";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/** Live price trend for one asset. Mirrors Python `GET /api/price-trend`. */
export function getPriceTrend(
  asset = "BTC",
  window: TimeWindow = "30D",
): Promise<PriceTrend> {
  const params = new URLSearchParams({ asset, window, days: "30" });
  return getJson<PriceTrend>(`/price-trend?${params.toString()}`);
}
