import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StatTile from "./StatTile.tsx";

describe("StatTile", () => {
  it("renders an up move with arrow, sign color and hint", () => {
    render(<StatTile label="Change" value="+2.50%" hint="+1.00 since Oct 1" tone="up" />);
    expect(screen.getByText("+2.50%")).toBeInTheDocument();
    const hint = screen.getByText(/since Oct 1/);
    expect(hint).toBeInTheDocument();
    expect(hint.textContent).toContain("▲");
  });

  it("renders a down move with the down glyph", () => {
    render(<StatTile label="Change" value="-1.00%" hint="-0.50" tone="down" />);
    expect(screen.getByText(/-0\.50/)).toBeInTheDocument();
    expect(screen.getByText(/-0\.50/).textContent).toContain("▼");
  });

  it("renders no glyph for neutral tones", () => {
    render(<StatTile label="Latest" value="59,932.14" hint="USD" />);
    expect(screen.queryByText("▲")).not.toBeInTheDocument();
    expect(screen.queryByText("▼")).not.toBeInTheDocument();
  });

  it("hides the glyph from assistive tech", () => {
    const { container } = render(
      <StatTile label="Change" value="+1%" hint="x" tone="up" />,
    );
    expect(
      container.querySelector('span[aria-hidden="true"]'),
    ).toBeInTheDocument();
  });
});
