import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NewsItem } from "@chaintelescope/shared";
import News from "./News.tsx";
import { formatPublished, hostOf, isHttpUrl } from "../lib/news.ts";
import { HttpApiError } from "../api/client.js";
import { newsReducer } from "../store/news/newsSlice.js";
import { scansReducer } from "../store/scans/scansSlice.js";
import { uploadProgressReducer } from "../store/uploadProgress/uploadProgressSlice.js";
import { StoreProvider } from "../store/StoreProvider.tsx";

vi.mock("../api/client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client.js")>()),
  getNews: vi.fn(),
}));

async function loadMock() {
  const client = await import("../api/client.js");
  return vi.mocked(client.getNews);
}

function renderNews(strict = false) {
  const store = configureStore({
    reducer: {
      news: newsReducer,
      scans: scansReducer,
      upload: uploadProgressReducer,
    },
  });
  const view = render(
    <StoreProvider store={store}>
      {strict ? (
        <StrictMode>
          <News />
        </StrictMode>
      ) : (
        <News />
      )}
    </StoreProvider>,
  );
  return { ...view, store };
}

const items: NewsItem[] = [
  {
    id: "1",
    source: "https://www.coindesk.com/rss",
    publishedAt: "2026-10-26T12:00:00.000Z",
    title: "ETF flows rebound",
    url: "https://example.com/etf",
    tags: ["BTC"],
  },
  {
    id: "2",
    source: "not-a-url",
    publishedAt: "not-a-date",
    title: "Local weather",
    url: "https://example.com/weather",
    tags: [],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("News states", () => {
  it("shows skeleton rows while fetching", async () => {
    const getNews = await loadMock();
    getNews.mockReturnValueOnce(new Promise(() => {}));
    const { container, unmount } = renderNews();
    expect(
      screen.getByText("Loading the latest headlines…"),
    ).toBeInTheDocument();
    expect(container.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
    unmount();
  });

  it("renders rows with hostname, date and links", async () => {
    const getNews = await loadMock();
    getNews.mockResolvedValueOnce(items);
    renderNews();
    await waitFor(() =>
      expect(screen.getByText("ETF flows rebound")).toBeInTheDocument(),
    );
    expect(getNews).toHaveBeenCalledWith("BTC", 10, expect.anything());
    expect(screen.getByText("www.coindesk.com")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "ETF flows rebound" }),
    ).toHaveAttribute("href", "https://example.com/etf");
    expect(screen.getByText("not-a-url")).toBeInTheDocument();
    expect(screen.getByText("not-a-date")).toBeInTheDocument();
  });

  it("renders non-http URLs as plain text, never as links", async () => {
    const getNews = await loadMock();
    getNews.mockResolvedValueOnce([
      {
        id: "evil",
        source: "evil",
        publishedAt: "2026-10-26T12:00:00.000Z",
        title: "Click me",
        url: "javascript:alert(1)",
        tags: [],
      },
    ]);
    renderNews();
    await waitFor(() =>
      expect(screen.getByText("Click me")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("javascript:alert(1)")).toBeInTheDocument();
  });

  it("shows the empty state when the table is empty", async () => {
    const getNews = await loadMock();
    getNews.mockResolvedValueOnce([]);
    renderNews();
    await waitFor(() =>
      expect(screen.getByText("No news items available.")).toBeInTheDocument(),
    );
  });

  it("pins the error branches and recovers through Try again", async () => {
    const getNews = await loadMock();
    getNews.mockRejectedValueOnce(new HttpApiError(502, "Bad Gateway"));
    getNews.mockResolvedValueOnce(items);
    renderNews();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("News unavailable"),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("API error 502");
    expect(screen.getByRole("alert")).toHaveTextContent("http_error");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.getByText("ETF flows rebound")).toBeInTheDocument(),
    );
  });

  it("shows the unreachable branch for offline throws", async () => {
    const getNews = await loadMock();
    getNews.mockRejectedValueOnce(new TypeError("fetch failed"));
    const { unmount } = renderNews();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("API unreachable"),
    );
    unmount();
  });

  it("shows a distinct message on client timeout", async () => {
    const getNews = await loadMock();
    getNews.mockRejectedValueOnce(
      new DOMException("The operation timed out", "TimeoutError"),
    );
    renderNews();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Request timed out"),
    );
  });

  it("aborts the in-flight request on unmount", async () => {
    const getNews = await loadMock();
    let signal: AbortSignal | undefined;
    getNews.mockImplementationOnce(
      (_watchlist, _limit, requestSignal) =>
        new Promise(() => {
          signal = requestSignal;
        }),
    );
    const { unmount } = renderNews();
    await waitFor(() => expect(signal).toBeDefined());

    unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("aborts a retry request on unmount", async () => {
    const getNews = await loadMock();
    const signals: AbortSignal[] = [];
    getNews.mockImplementation((_watchlist, _limit, requestSignal) => {
      if (requestSignal) signals.push(requestSignal);
      if (signals.length === 1) {
        return Promise.reject(new HttpApiError(502, "Bad Gateway"));
      }
      return new Promise(() => {});
    });
    const { unmount } = renderNews();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(signals).toHaveLength(2));
    unmount();

    expect(signals[1]?.aborted).toBe(true);
  });

  it("renders safely under StrictMode", async () => {
    const getNews = await loadMock();
    getNews.mockResolvedValue(items);
    renderNews(true);

    await waitFor(() =>
      expect(screen.getByText("ETF flows rebound")).toBeInTheDocument(),
    );
    expect(getNews).toHaveBeenCalled();
  });
});

describe("formatPublished / hostOf / isHttpUrl", () => {
  it("formats UTC instants and passes garbage through", () => {
    expect(formatPublished("2026-10-26T12:00:00.000Z")).toBe(
      "Oct 26, 2026, 12:00 UTC",
    );
    expect(formatPublished("garbage")).toBe("garbage");
    expect(hostOf("https://www.coindesk.com/rss")).toBe("www.coindesk.com");
    expect(hostOf("not-a-url")).toBe("not-a-url");
    expect(hostOf("")).toBe("");
    expect(isHttpUrl("https://example.com/x")).toBe(true);
    expect(isHttpUrl("http://example.com/x")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("data:text/html,<h1>x</h1>")).toBe(false);
    expect(isHttpUrl("notaurl")).toBe(false);
  });
});
