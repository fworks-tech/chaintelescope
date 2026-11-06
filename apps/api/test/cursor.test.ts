/** @fileoverview Cursor opaco: round-trip e rejeição de payload inválido. */

import { describe, expect, test } from "vitest";
import { decodeCursor, encodeCursor } from "@chaintelescope/shared";

const ID = "018f4e2a-7c3b-7d4e-9f00-2b1c3d4e5f60";

describe("scan cursor", () => {
  test("round-trips createdAt and id", () => {
    const cursor = { createdAt: "2026-01-01T00:00:00.000Z", id: ID };

    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  test("is opaque but URL-safe", () => {
    const encoded = encodeCursor({
      createdAt: "2026-01-01T00:00:00.000Z",
      id: ID,
    });

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain("2026");
  });

  test("rejects garbage, non-objects, bad dates and non-UUID ids", () => {
    const encode = (value: unknown): string =>
      Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

    expect(() => decodeCursor("not-base64-json")).toThrow(/invalid cursor/);
    expect(() => decodeCursor(encode(null))).toThrow(/invalid cursor/);
    expect(() =>
      decodeCursor(encode({ createdAt: "not-a-date", id: ID })),
    ).toThrow(/invalid cursor/);
    expect(() =>
      decodeCursor(encode({ createdAt: "2026-01-01T00:00:00.000Z", id: "1" })),
    ).toThrow(/invalid cursor/);
  });
});
