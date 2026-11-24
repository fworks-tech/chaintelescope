import { describe, expect, it } from "vitest";
import { ListNewsQuerySchema } from "@chaintelescope/shared";
import { escapeLike } from "../src/db/repos/news.js";
import { parseWatchlist } from "../src/routes/news.js";

describe("parseWatchlist", () => {
  it("splits, trims, dedupes, drops blanks", () => {
    expect(parseWatchlist("BTC, eth ,,BTC")).toEqual(["BTC", "eth"]);
  });

  it("treats undefined and empty as no filter", () => {
    expect(parseWatchlist(undefined)).toEqual([]);
    expect(parseWatchlist("")).toEqual([]);
    expect(parseWatchlist("  , ")).toEqual([]);
  });
});

describe("escapeLike", () => {
  it("escapes %, _ and backslash so user input stays literal", () => {
    expect(escapeLike("100%_x\\y")).toBe("100\\%\\_x\\\\y");
  });

  it("leaves plain symbols untouched", () => {
    expect(escapeLike("BTC")).toBe("BTC");
  });
});

describe("ListNewsQuerySchema", () => {
  it("defaults to the BTC watchlist with limit 10", () => {
    const { error, value } = ListNewsQuerySchema.validate({});
    expect(error).toBeUndefined();
    expect(value).toMatchObject({ watchlist: "BTC", limit: 10 });
  });

  it("rejects out-of-range limits", () => {
    expect(ListNewsQuerySchema.validate({ limit: 0 }).error).toBeDefined();
    expect(ListNewsQuerySchema.validate({ limit: 101 }).error).toBeDefined();
    expect(ListNewsQuerySchema.validate({ limit: "ten" }).error).toBeDefined();
  });

  it("rejects unknown keys and oversized watchlists", () => {
    expect(
      ListNewsQuerySchema.validate({ limit: 10, asset: "BTC" }).error,
    ).toBeDefined();
    expect(
      ListNewsQuerySchema.validate({ watchlist: "x".repeat(201) }).error,
    ).toBeDefined();
  });
});
