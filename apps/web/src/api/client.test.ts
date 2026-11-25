import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpApiError, getNews, toApiError } from "./client.js";

afterEach(() => {
  vi.unstubAllGlobals();
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
