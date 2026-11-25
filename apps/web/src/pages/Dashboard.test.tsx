import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard.tsx";
import { HttpApiError } from "../api/client.js";

vi.mock("../api/client.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/client.js")>()),
  getPriceTrend: vi.fn(),
}));

async function loadMock() {
  const client = await import("../api/client.js");
  return vi.mocked(client.getPriceTrend);
}

const series = {
  asset: "BTC",
  dates: ["2026-10-24T00:00:00", "2026-10-25T00:00:00", "2026-10-26T00:00:00"],
  prices: [100, 121, 110],
  trend: [100, 105, 108],
  source: "mock" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Dashboard states", () => {
  it("shows skeleton tiles while fetching", async () => {
    const getPriceTrend = await loadMock();
    getPriceTrend.mockReturnValueOnce(new Promise(() => {}));
    const { container, unmount } = render(<Dashboard />);
    expect(
      screen.getByText("Loading the latest price trend…"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".MuiSkeleton-root"),
    ).toBeInTheDocument();
    unmount();
  });

  it("pins the 502 branch and recovers through Try again", async () => {
    const getPriceTrend = await loadMock();
    getPriceTrend.mockRejectedValueOnce(new HttpApiError(502, "Bad Gateway"));
    getPriceTrend.mockResolvedValueOnce(series);
    render(<Dashboard />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Price trend unavailable",
      ),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("API error 502");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.getByText("110.00")).toBeInTheDocument(),
    );
    expect(screen.getByText("Window summary")).toBeInTheDocument();
    expect(screen.getByText("121.00")).toBeInTheDocument();
  });

  it("shows the unreachable branch for non-API throws", async () => {
    const getPriceTrend = await loadMock();
    getPriceTrend.mockRejectedValueOnce(new TypeError("fetch failed"));
    render(<Dashboard />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("API unreachable"),
    );
  });

  it("shows a distinct message on client timeout", async () => {
    const getPriceTrend = await loadMock();
    getPriceTrend.mockRejectedValueOnce(
      new DOMException("The operation timed out", "TimeoutError"),
    );
    render(<Dashboard />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Request timed out",
      ),
    );
  });
});
