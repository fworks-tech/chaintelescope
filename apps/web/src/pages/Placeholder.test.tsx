import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import NotFound from "./NotFound.tsx";
import Placeholder from "./Placeholder.tsx";

describe("Placeholder", () => {
  it("renders title, description and a way back", () => {
    render(
      <MemoryRouter>
        <Placeholder title="News" description="Headlines for the watchlist." />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "News" })).toBeInTheDocument();
    expect(
      screen.getByText("Headlines for the watchlist."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to the dashboard" }),
    ).toBeInTheDocument();
  });
});

describe("NotFound", () => {
  it("renders 404 with a way back", () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to the dashboard" }),
    ).toBeInTheDocument();
  });
});
