import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Layout from "./Layout.tsx";

describe("Layout", () => {
  it("renders all five page links", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Layout />
      </MemoryRouter>,
    );
    for (const label of ["Dashboard", "News", "Alerts", "Risk", "Newsletter"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("marks the current page with aria-current", () => {
    render(
      <MemoryRouter initialEntries={["/news"]}>
        <Layout />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "News" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Dashboard" }),
    ).not.toHaveAttribute("aria-current");
  });
});
