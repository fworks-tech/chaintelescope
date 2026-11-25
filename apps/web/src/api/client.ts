import type {
  AuthSessionResponse,
  AuthUser,
  DashboardSnapshot,
  NewsletterSubscription,
  NewsletterSubscriptionPayload,
  NewsItem,
  ScanDto,
  ScanListResponse,
} from "@chaintelescope/shared";
import type {
  LoginPayload,
  RegisterPayload,
  ScanStatus,
} from "@chaintelescope/shared";
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

function errorFromEnvelope(
  body: unknown,
  status: number,
  statusText: string,
): HttpApiError {
  let code = "http_error";
  let message = statusText || `HTTP ${status}`;
  let requestId: string | undefined;
  if (isRecord(body) && isRecord(body.error)) {
    if (typeof body.error.code === "string") code = body.error.code;
    if (typeof body.error.message === "string") message = body.error.message;
    if (typeof body.error.requestId === "string")
      requestId = body.error.requestId;
  }
  return new HttpApiError(status, message, code, requestId);
}

async function readHttpError(res: Response): Promise<HttpApiError> {
  try {
    const body: unknown = await res.json();
    return errorFromEnvelope(body, res.status, res.statusText);
  } catch (err) {
    if (
      err instanceof DOMException &&
      (err.name === "AbortError" || err.name === "TimeoutError")
    ) {
      throw err;
    }
    // HTML/text error bodies fall back to the HTTP status text.
    return new HttpApiError(res.status, res.statusText || `HTTP ${res.status}`);
  }
}

function readXhrError(
  status: number,
  statusText: string,
  responseText: string,
): HttpApiError {
  try {
    const body: unknown = JSON.parse(responseText);
    return errorFromEnvelope(body, status, statusText);
  } catch {
    return new HttpApiError(status, statusText || `HTTP ${status}`);
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const onAbort = () => controller.abort(signal?.reason);
  const onTimeout = () => controller.abort(timeout.reason);

  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  if (timeout.aborted) onTimeout();
  else timeout.addEventListener("abort", onTimeout, { once: true });

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    signal?.removeEventListener("abort", onAbort);
    timeout.removeEventListener("abort", onTimeout);
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetchWithTimeout(`${BASE_URL}${path}`, {}, signal);
  if (!res.ok) {
    throw await readHttpError(res);
  }
  return (await res.json()) as T;
}

/**
 * Node origin for `/scans`, `/auth/*` and `/newsletter/subscribe`. There is
 * no same-origin fallback: those routes do not exist on the Python API, so a
 * missing variable must fail loudly instead of hitting the SPA rewrite.
 */
export function getNodeBaseUrl(): string {
  const base = import.meta.env.VITE_NODE_API_BASE_URL?.replace(/\/$/, "");
  if (!base) {
    throw new HttpApiError(
      503,
      "Node API not configured",
      "node_api_not_configured",
    );
  }
  return base;
}

interface NodeJsonOptions {
  readonly method?: string;
  readonly body?: unknown;
  readonly token?: string;
  readonly signal?: AbortSignal;
  readonly expectEmpty?: boolean;
}

async function nodeJson<T>(
  path: string,
  options: NodeJsonOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token !== undefined)
    headers["Authorization"] = `Bearer ${options.token}`;

  const res = await fetchWithTimeout(
    `${getNodeBaseUrl()}${path}`,
    {
      method: options.method ?? "GET",
      headers,
      credentials: "include",
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    },
    options.signal,
  );
  if (!res.ok) {
    throw await readHttpError(res);
  }
  if (options.expectEmpty === true) return undefined as T;
  return (await res.json()) as T;
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

export interface SnapshotArgs {
  readonly window?: TimeWindow;
  readonly assets?: string;
  readonly source?: string;
  readonly trend?: string;
}

/** Dashboard snapshot using the shared camelCase contract. */
export function getSnapshot(
  args: SnapshotArgs = {},
  signal?: AbortSignal,
): Promise<DashboardSnapshot> {
  const params = new URLSearchParams({
    window: args.window ?? "30D",
    assets: args.assets ?? "BTC",
  });
  if (args.source !== undefined) params.set("source", args.source);
  if (args.trend !== undefined) params.set("trend", args.trend);
  return getJson<DashboardSnapshot>(`/snapshot?${params.toString()}`, signal);
}

export interface ListScansArgs {
  readonly cursor?: string;
  readonly limit?: number;
  readonly status?: ScanStatus;
}

/** Paginated scan history; bearer token required. */
export function listScans(
  args: ListScansArgs,
  token: string,
  signal?: AbortSignal,
): Promise<ScanListResponse> {
  const params = new URLSearchParams({ limit: String(args.limit ?? 50) });
  if (args.cursor !== undefined) params.set("cursor", args.cursor);
  if (args.status !== undefined) params.set("status", args.status);
  return nodeJson<ScanListResponse>(`/scans?${params.toString()}`, {
    token,
    signal,
  });
}

/** Single scan detail; bearer token required. */
export function getScan(
  id: string,
  token: string,
  signal?: AbortSignal,
): Promise<ScanDto> {
  return nodeJson<ScanDto>(`/scans/${id}`, { token, signal });
}

/** Cancel an in-flight scan; 202 carries no body. */
export function cancelScan(
  id: string,
  token: string,
  signal?: AbortSignal,
): Promise<void> {
  return nodeJson<void>(`/scans/${id}/cancel`, {
    method: "POST",
    token,
    signal,
    expectEmpty: true,
  });
}

/**
 * Stream a scan upload with progress. XHR is used because fetch has no
 * upload progress events cross-browser. Abort clears only the client request;
 * server reconciliation needs the idempotency key from #209.
 */
export function uploadScan(
  file: Blob,
  token: string,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<ScanDto> {
  const base = getNodeBaseUrl();
  return new Promise<ScanDto>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/scans`, true);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.withCredentials = true;
    xhr.timeout = REQUEST_TIMEOUT_MS;

    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      xhr.abort();
    };

    xhr.upload.onprogress = (event: ProgressEvent) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(event.loaded / event.total);
      }
    };
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as ScanDto);
        } catch {
          reject(new HttpApiError(xhr.status, "Invalid scan response"));
        }
      } else {
        reject(readXhrError(xhr.status, xhr.statusText, xhr.responseText));
      }
    };
    xhr.onerror = () => {
      cleanup();
      reject(new TypeError("fetch failed"));
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(new DOMException("The operation timed out", "TimeoutError"));
    };
    xhr.onabort = () => {
      cleanup();
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };

    if (signal?.aborted) {
      onAbort();
    } else {
      signal?.addEventListener("abort", onAbort, { once: true });
      xhr.send(file);
    }
  });
}

/** Register; the refresh token arrives in the HttpOnly `/auth` cookie. */
export function register(
  payload: RegisterPayload,
  signal?: AbortSignal,
): Promise<AuthSessionResponse> {
  return nodeJson<AuthSessionResponse>("/auth/register", {
    method: "POST",
    body: payload,
    signal,
  });
}

/** Login; the refresh token arrives in the HttpOnly `/auth` cookie. */
export function login(
  payload: LoginPayload,
  signal?: AbortSignal,
): Promise<AuthSessionResponse> {
  return nodeJson<AuthSessionResponse>("/auth/login", {
    method: "POST",
    body: payload,
    signal,
  });
}

/** Rotate the refresh cookie; no bearer token needed. */
export function refreshSession(
  signal?: AbortSignal,
): Promise<AuthSessionResponse> {
  return nodeJson<AuthSessionResponse>("/auth/refresh", {
    method: "POST",
    signal,
  });
}

/** Logout; 204 carries no body. */
export function logout(signal?: AbortSignal): Promise<void> {
  return nodeJson<void>("/auth/logout", {
    method: "POST",
    signal,
    expectEmpty: true,
  });
}

/** Current user for a bearer token. */
export function getMe(token: string, signal?: AbortSignal): Promise<AuthUser> {
  return nodeJson<AuthUser>("/auth/me", { token, signal });
}

/** Newsletter subscribe through the canonical Node 201 contract. */
export function subscribeNewsletter(
  payload: NewsletterSubscriptionPayload,
  signal?: AbortSignal,
): Promise<NewsletterSubscription> {
  return nodeJson<NewsletterSubscription>("/newsletter/subscribe", {
    method: "POST",
    body: payload,
    signal,
  });
}
