import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NewsItem } from "@chaintelescope/shared";
import News from "./News.tsx";
import { formatPublished, hostOf } from "../lib/news.ts";
import { ApiError } from "../api/client.js";

vi.mock("../api/client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client.js")>()),
  getNews: vi.fn(),
}));

async function loadMock() {
  const client = await import("../api/client.js");
  return vi.mocked(client.getNews);
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

afterEach(() => {
  vi.clearAllMocks();
});

describe("News states", () => {
  it("shows skeleton rows while fetching", async () => {
    const getNews = await loadMock();
    getNews.mockReturnValueOnce(new Promise(() => {}));
    const { container, unmount } = render(<News />);
    expect(
      screen.getByText("Loading the latest headlines…"),
    ).toBeInTheDocument();
    expect(container.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
    unmount();
  });

  it("renders rows with hostname, date and links", async () => {
    const getNews = await loadMock();
    getNews.mockResolvedValueOnce(items);
    render(<News />);
    await waitFor(() =>
      expect(screen.getByText("ETF flows rebound")).toBeInTheDocument(),
    );
    expect(screen.getByText("www.coindesk.com")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "ETF flows rebound" }),
    ).toHaveAttribute("href", "https://example.com/etf");
    expect(screen.getByText("not-a-url")).toBeInTheDocument();
    expect(screen.getByText("not-a-date")).toBeInTheDocument();
  });

  it("shows the empty state when the table is empty", async () => {
    const getNews = await loadMock();
    getNews.mockResolvedValueOnce([]);
    render(<News />);
    await waitFor(() =>
      expect(
        screen.getByText("No news items available."),
      ).toBeInTheDocument(),
    );
  });

  it("pins the error branches and recovers through Try again", async () => {
    const getNews = await loadMock();
    getNews.mockRejectedValueOnce(new ApiError(502, "Bad Gateway"));
    getNews.mockResolvedValueOnce(items);
    render(<News />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("News unavailable"),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("API error 502");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.getByText("ETF flows rebound")).toBeInTheDocument(),
    );
  });

  it("shows unreachable and timeout distinctly", async () => {
    const getNews = await loadMock();
    getNews.mockRejectedValueOnce(new TypeError("fetch failed"));
    const { unmount } = render(<News />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("API unreachable"),
    );
    unmount();

    getNews.mockRejectedValueOnce(
      new DOMException("The operation timed out", "TimeoutError"),
    );
    render(<News />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Request timed out"),
    );
  });
});

describe("formatPublished / hostOf", () => {
  it("formats UTC instants and passes garbage through", () => {
    expect(formatPublished("2026-10-26T12:00:00.000Z")).toBe(
      "Oct 26, 2026, 12:00 UTC",
    );
    expect(formatPublished("garbage")).toBe("garbage");
    expect(hostOf("https://www.coindesk.com/rss")).toBe("www.coindesk.com");
    expect(hostOf("not-a-url")).toBe("not-a-url");
    expect(hostOf("")).toBe("");
  });
});
