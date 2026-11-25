import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NewsItem } from "@chaintelescope/shared";
import { HttpApiError } from "../../api/client.js";
import {
  fetchNews,
  newsReducer,
  selectAllNews,
  selectNewsById,
  selectNewsError,
  selectNewsStatus,
} from "./newsSlice.js";

vi.mock("../../api/client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/client.js")>()),
  getNews: vi.fn(),
}));

const items: NewsItem[] = [
  {
    id: "1",
    source: "https://www.sec.gov/news/pressreleases.rss",
    publishedAt: "2026-11-20T18:03:24.000Z",
    title: "SEC proposal",
    url: "https://www.sec.gov/newsroom/press-releases/2026-117",
    tags: [],
  },
];

function makeStore() {
  return configureStore({ reducer: { news: newsReducer } });
}

async function loadGetNews() {
  const client = await import("../../api/client.js");
  return vi.mocked(client.getNews);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("news store", () => {
  it("exposes pending then fulfilled state through normalized selectors", async () => {
    const getNews = await loadGetNews();
    let resolve!: (value: NewsItem[]) => void;
    getNews.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const store = makeStore();

    const request = store.dispatch(fetchNews({ watchlist: "BTC", limit: 10 }));
    expect(selectNewsStatus(store.getState())).toBe("loading");

    resolve(items);
    await request;

    expect(selectNewsStatus(store.getState())).toBe("idle");
    expect(selectAllNews(store.getState())).toEqual(items);
    expect(selectNewsById(store.getState(), "1")).toEqual(items[0]);
  });

  it("stores the typed API error on rejection", async () => {
    const getNews = await loadGetNews();
    getNews.mockRejectedValueOnce(
      new HttpApiError(503, "Service unavailable", "service_unavailable"),
    );
    const store = makeStore();

    await store.dispatch(fetchNews({ watchlist: "BTC", limit: 10 }));

    expect(selectNewsStatus(store.getState())).toBe("error");
    expect(selectNewsError(store.getState())).toMatchObject({
      code: "service_unavailable",
      message: "Service unavailable",
    });
  });

  it("ignores a fulfilled response from a superseded request", async () => {
    const getNews = await loadGetNews();
    let resolveOld!: (value: NewsItem[]) => void;
    getNews.mockReturnValueOnce(
      new Promise((done) => {
        resolveOld = done;
      }),
    );
    getNews.mockResolvedValueOnce(items);
    const store = makeStore();

    const oldRequest = store.dispatch(
      fetchNews({ watchlist: "BTC", limit: 10 }),
    );
    const latestRequest = store.dispatch(
      fetchNews({ watchlist: "BTC", limit: 10 }),
    );
    await latestRequest;
    resolveOld([
      {
        id: "old",
        source: "https://www.sec.gov/news/pressreleases.rss",
        publishedAt: "2026-11-19T18:03:24.000Z",
        title: "Old response",
        url: "https://www.sec.gov/newsroom/press-releases/2026-116",
        tags: [],
      },
    ]);
    await oldRequest;

    expect(selectAllNews(store.getState())).toEqual(items);
  });

  it("ignores a rejected response from a superseded request", async () => {
    const getNews = await loadGetNews();
    let rejectOld!: (reason: unknown) => void;
    getNews.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectOld = reject;
      }),
    );
    getNews.mockResolvedValueOnce(items);
    const store = makeStore();

    const oldRequest = store.dispatch(
      fetchNews({ watchlist: "BTC", limit: 10 }),
    );
    const latestRequest = store.dispatch(
      fetchNews({ watchlist: "BTC", limit: 10 }),
    );
    await latestRequest;
    rejectOld(new HttpApiError(502, "Old failure"));
    await oldRequest;

    expect(selectNewsStatus(store.getState())).toBe("idle");
    expect(selectAllNews(store.getState())).toEqual(items);
    expect(selectNewsError(store.getState())).toBeNull();
  });

  it("aborts the request and leaves state unchanged on an aborted rejection", async () => {
    const getNews = await loadGetNews();
    let signal: AbortSignal | undefined;
    getNews.mockImplementationOnce(
      (_watchlist, _limit, requestSignal) =>
        new Promise((_resolve, reject) => {
          signal = requestSignal;
          requestSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const store = makeStore();

    const request = store.dispatch(fetchNews({ watchlist: "BTC", limit: 10 }));
    request.abort();
    await request;

    expect(signal?.aborted).toBe(true);
    expect(selectNewsStatus(store.getState())).toBe("idle");
    expect(selectNewsError(store.getState())).toBeNull();
  });
});
