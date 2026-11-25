import { describe, expect, it } from "vitest";
import { normalizeNewsPublishedAt } from "../src/ingest/news.js";

describe("normalizeNewsPublishedAt", () => {
  it("normalizes offsets to the Python UTC lexical form", () => {
    expect(normalizeNewsPublishedAt("2026-11-20T13:03:24-05:00")).toBe(
      "2026-11-20T18:03:24+00:00",
    );
  });

  it("preserves microseconds without emitting zero fractions", () => {
    expect(normalizeNewsPublishedAt("2026-11-20T13:03:24.123456-05:00")).toBe(
      "2026-11-20T18:03:24.123456+00:00",
    );
    expect(normalizeNewsPublishedAt("2026-11-20T13:03:24.000Z")).toBe(
      "2026-11-20T13:03:24+00:00",
    );
  });

  it("treats timezone-less ISO input as UTC", () => {
    expect(normalizeNewsPublishedAt("2026-11-20T13:03:24")).toBe(
      "2026-11-20T13:03:24+00:00",
    );
  });

  it("rejects invalid dates", () => {
    expect(() => normalizeNewsPublishedAt("not-a-date")).toThrow(
      "Invalid publication date",
    );
    expect(() => normalizeNewsPublishedAt("2026-02-30T00:00:00Z")).toThrow(
      "Invalid publication date",
    );
  });
});
