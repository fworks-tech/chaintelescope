import { describe, expect, it } from "vitest";
import { approvedNewsSourceFeedUrls } from "@chaintelescope/shared";

const SEC_FEED = "https://www.sec.gov/news/pressreleases.rss";

describe("approvedNewsSourceFeedUrls", () => {
  it("returns only enabled sources with approved rights", () => {
    expect(
      approvedNewsSourceFeedUrls(new Date("2026-11-24T23:59:59.000Z")),
    ).toEqual([SEC_FEED]);
  });

  it("excludes a source on its exclusive UTC expiry date", () => {
    expect(
      approvedNewsSourceFeedUrls(new Date("2027-02-22T00:00:00.000Z")),
    ).toEqual([]);
  });

  it("includes a source through the day before expiry", () => {
    expect(
      approvedNewsSourceFeedUrls(new Date("2027-02-21T23:59:59.000Z")),
    ).toEqual([SEC_FEED]);
  });
});
