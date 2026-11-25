import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelScan,
  getMe,
  getNews,
  getScan,
  getSnapshot,
  HttpApiError,
  listScans,
  login,
  logout,
  refreshSession,
  register,
  subscribeNewsletter,
  toApiError,
  uploadScan,
} from "./client.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("API error normalization", () => {
  it("reads the Boom error envelope without losing the HTTP status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "service_unavailable",
            message: "News is temporarily unavailable",
            requestId: "req-123",
          },
        }),
        {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getNews()).rejects.toMatchObject({
      status: 503,
      code: "service_unavailable",
      message: "News is temporarily unavailable",
      requestId: "req-123",
    });
  });

  it("falls back to statusText when the error body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>upstream failure</html>", {
          status: 502,
          statusText: "Bad Gateway",
        }),
      ),
    );

    await expect(getNews()).rejects.toMatchObject({
      status: 502,
      code: "http_error",
      message: "Bad Gateway",
    });
  });

  it("preserves a timeout while reading an HTTP error body", async () => {
    const timeout = new DOMException("The operation timed out", "TimeoutError");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        json: vi.fn().mockRejectedValue(timeout),
      }),
    );

    await expect(getNews()).rejects.toBe(timeout);
  });

  it("forwards an external abort without AbortSignal.any", async () => {
    let fetchSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, options: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            fetchSignal = options.signal;
            options.signal.addEventListener(
              "abort",
              () => reject(options.signal.reason),
              { once: true },
            );
          }),
      ),
    );
    const controller = new AbortController();

    const request = getNews("BTC", 10, controller.signal);
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchSignal?.aborted).toBe(true);
  });

  it("returns plain serializable values for network and timeout failures", () => {
    const network = toApiError(new TypeError("fetch failed"));
    const timeout = toApiError(
      new DOMException("The operation timed out", "TimeoutError"),
    );

    expect(network).toEqual({ code: "network", message: "API unreachable" });
    expect(timeout).toEqual({ code: "timeout", message: "Request timed out" });
    expect(network).not.toBeInstanceOf(Error);
  });

  it("copies HTTP errors into plain state values", () => {
    const error = new HttpApiError(503, "Unavailable", "service_unavailable");

    expect(toApiError(error)).toEqual({
      code: "service_unavailable",
      message: "Unavailable",
      status: 503,
    });
  });
});

describe("snapshot contract", () => {
  it("requests the camelCase snapshot through the public base", async () => {
    const snapshot = {
      timeWindow: "30D",
      watchlist: ["BTC"],
      trendFilter: "all",
      primaryAsset: "BTC",
      priceDates: ["2026-01-01T00:00:00.000Z"],
      priceValues: [1],
      priceSource: "mock",
      kpis: [],
      riskScores: [62],
      riskLabels: ["Market"],
      riskColors: ["#f79009"],
      alerts: ["BTC below 63,500"],
      news: ["SEC proposal"],
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getSnapshot({ window: "30D", assets: "BTC" }),
    ).resolves.toEqual(snapshot);
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("/api/snapshot?");
    expect(url).toContain("window=30D");
  });
});

describe("node-backed client", () => {
  it("fails clearly when the node base is missing", async () => {
    vi.stubEnv("VITE_NODE_API_BASE_URL", "");

    await expect(listScans({}, "token")).rejects.toMatchObject({
      code: "node_api_not_configured",
    });
  });

  it("lists scans with a bearer token", async () => {
    vi.stubEnv("VITE_NODE_API_BASE_URL", "https://node.test");
    const body = { items: [], nextCursor: null };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listScans({}, "bearer-123")).resolves.toEqual(body);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://node.test/scans?limit=50");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer bearer-123",
    );
  });

  it("fetches one scan", async () => {
    vi.stubEnv("VITE_NODE_API_BASE_URL", "https://node.test");
    const scan = {
      id: "scan-1",
      kind: "upload",
      status: "completed",
      assetSymbol: null,
      contentHash: "abc",
      failureReason: null,
      durationMs: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
      startedAt: null,
      finishedAt: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(scan), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(getScan("scan-1", "bearer-123")).resolves.toEqual(scan);
  });

  it("treats 202 cancel as void", async () => {
    vi.stubEnv("VITE_NODE_API_BASE_URL", "https://node.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 202 })),
    );

    await expect(cancelScan("scan-1", "bearer-123")).resolves.toBeUndefined();
  });

  it("logs in with credentials included", async () => {
    vi.stubEnv("VITE_NODE_API_BASE_URL", "https://node.test");
    const session = {
      accessToken: "access",
      expiresIn: 900,
      user: { id: "u1", email: "a@b.co", role: "user" },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(session), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      login({ email: "a@b.co", password: "long-enough-password" }),
    ).resolves.toEqual(session);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe("include");
  });

  it("registers, refreshes, fetches me and logs out", async () => {
    vi.stubEnv("VITE_NODE_API_BASE_URL", "https://node.test");
    const session = {
      accessToken: "access",
      expiresIn: 900,
      user: { id: "u1", email: "a@b.co", role: "user" },
    };
    const json = new Response(JSON.stringify(session), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const me = new Response(JSON.stringify(session.user), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const empty = new Response(null, { status: 204 });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json.clone())
      .mockResolvedValueOnce(json.clone())
      .mockResolvedValueOnce(me)
      .mockResolvedValueOnce(empty);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      register({ email: "a@b.co", password: "long-enough-password" }),
    ).resolves.toEqual(session);
    await expect(refreshSession()).resolves.toEqual(session);
    await expect(getMe("bearer-123")).resolves.toEqual(session.user);
    await expect(logout()).resolves.toBeUndefined();
  });

  it("subscribes through the canonical 201 contract", async () => {
    vi.stubEnv("VITE_NODE_API_BASE_URL", "https://node.test");
    const subscription = {
      id: "sub-1",
      email: "a@b.co",
      frequency: "Weekly",
      format: "Summary",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(subscription), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      subscribeNewsletter({
        email: "a@b.co",
        frequency: "Weekly",
        format: "Summary",
      }),
    ).resolves.toEqual(subscription);
  });
});

describe("scan upload", () => {
  function mockXhr(
    behavior: (xhr: {
      succeed(status: number, body: unknown): void;
      failNetwork(): void;
      upload: { onprogress: ((e: ProgressEvent) => void) | null };
    }) => void,
  ) {
    class MockXhr {
      static last: MockXhr | undefined;
      upload: { onprogress: ((e: ProgressEvent) => void) | null } = {
        onprogress: null,
      };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      status = 0;
      statusText = "";
      responseText = "";
      timeout = 0;
      withCredentials = false;
      aborted = false;
      headers: Record<string, string> = {};
      signalHandler: (() => void) | null = null;
      open(_method: string, _url: string, _async: boolean) {}
      setRequestHeader(name: string, value: string) {
        this.headers[name] = value;
      }
      send() {
        MockXhr.last = this;
        behavior(this);
      }
      abort() {
        this.aborted = true;
        this.onabort?.();
      }
      succeed(status: number, body: unknown) {
        this.status = status;
        this.responseText = JSON.stringify(body);
        this.onload?.();
      }
      failNetwork() {
        this.onerror?.();
      }
    }
    vi.stubGlobal("XMLHttpRequest", MockXhr);
    return MockXhr;
  }

  it("posts bytes and resolves the created scan", async () => {
    vi.stubEnv("VITE_NODE_API_BASE_URL", "https://node.test");
    const scan = {
      id: "scan-1",
      kind: "upload",
      status: "completed",
      assetSymbol: null,
      contentHash: "abc",
      failureReason: null,
      durationMs: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
      startedAt: null,
      finishedAt: null,
    };
    const MockXhr = mockXhr((xhr) => xhr.succeed(201, scan));

    await expect(
      uploadScan(new Blob(["bytes"]), "bearer-123"),
    ).resolves.toEqual(scan);
    expect(MockXhr.last?.headers["Authorization"]).toBe("Bearer bearer-123");
  });

  it("reports upload progress and aborts on signal", async () => {
    vi.stubEnv("VITE_NODE_API_BASE_URL", "https://node.test");
    const MockXhr = mockXhr((xhr) => {
      xhr.upload.onprogress?.({
        lengthComputable: true,
        loaded: 50,
        total: 100,
      } as ProgressEvent);
    });
    const controller = new AbortController();
    const seen: number[] = [];

    const request = uploadScan(
      new Blob(["bytes"]),
      "bearer-123",
      (fraction) => seen.push(fraction),
      controller.signal,
    );
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(seen).toEqual([0.5]);
    expect(MockXhr.last?.aborted).toBe(true);
  });
});
