import type { NewsItem } from "@chaintelescope/shared";
import type { PriceTrend, TimeWindow } from "@chaintelescope/shared/market";
import { TIME_WINDOW_DAYS } from "@chaintelescope/shared/market";

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

export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly status?: number;
  readonly requestId?: string;
}

export class HttpApiError extends Error implements ApiError {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(
    status: number,
    message: string,
    code = "http_error",
    requestId?: string,
  ) {
    super(message);
    this.name = "HttpApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readHttpError(res: Response): Promise<HttpApiError> {
  let code = "http_error";
  let message = res.statusText || `HTTP ${res.status}`;
  let requestId: string | undefined;
  try {
    const body: unknown = await res.json();
    if (isRecord(body) && isRecord(body.error)) {
      if (typeof body.error.code === "string") code = body.error.code;
      if (typeof body.error.message === "string") message = body.error.message;
      if (typeof body.error.requestId === "string")
        requestId = body.error.requestId;
    }
  } catch (err) {
    if (
      err instanceof DOMException &&
      (err.name === "AbortError" || err.name === "TimeoutError")
    ) {
      throw err;
    }
    // HTML/text error bodies fall back to the HTTP status text.
  }
  return new HttpApiError(res.status, message, code, requestId);
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort(signal?.reason);
  const onTimeout = () => controller.abort(timeout.reason);

  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  if (timeout.aborted) onTimeout();
  else timeout.addEventListener("abort", onTimeout, { once: true });

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      throw await readHttpError(res);
    }
    return (await res.json()) as T;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    timeout.removeEventListener("abort", onTimeout);
  }
}

/** True for the 15s client timeout — surfaced distinctly from offline. */
export function isTimeout(err: unknown): boolean {
  return err instanceof DOMException && err.name === "TimeoutError";
}

/** Plain, serializable error value for `createAsyncThunk` rejection state. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof HttpApiError) {
    return {
      code: err.code,
      message: err.message,
      status: err.status,
      ...(err.requestId === undefined ? {} : { requestId: err.requestId }),
    };
  }
  if (isTimeout(err)) {
    return { code: "timeout", message: "Request timed out" };
  }
  if (err instanceof DOMException && err.name === "AbortError") {
    return { code: "aborted", message: "Request aborted" };
  }
  return { code: "network", message: "API unreachable" };
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

/**
 * Latest news rows for a watchlist. Mirrors Python `GET /api/news`.
 * Empty watchlist means no filter (server returns the latest of everything).
 */
export function getNews(
  watchlist = "BTC",
  limit = 10,
  signal?: AbortSignal,
): Promise<NewsItem[]> {
  const params = new URLSearchParams({ watchlist, limit: String(limit) });
  return getJson<NewsItem[]>(`/news?${params.toString()}`, signal);
}
