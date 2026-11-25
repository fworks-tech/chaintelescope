import assert from "node:assert/strict";
import { test } from "node:test";
import { validateNewsSources } from "./sync-news-sources.mjs";

const NOW = Date.parse("2026-11-24T00:00:00Z");
const source = {
  key: "example",
  name: "Example",
  homepageUrl: "https://example.com",
  feedUrl: "https://example.com/feed.xml",
  adapter: "rss",
  language: "en",
  enabled: true,
  automationRights: "approved",
  metadataRights: "approved",
  imageRights: "placeholder",
  termsUrl: "https://example.com/terms",
  reviewedAt: "2026-11-24",
  reviewExpiresAt: "2027-02-22",
  pollIntervalMinutes: 60,
  allowedImageHosts: [],
};

test("accepts a valid 90-day review window", () => {
  assert.doesNotThrow(() => validateNewsSources([source], NOW));
});

test("rejects impossible or malformed review dates", () => {
  assert.throws(
    () =>
      validateNewsSources([{ ...source, reviewExpiresAt: "2026-02-30" }], NOW),
    /impossible review date/,
  );
  assert.throws(
    () => validateNewsSources([{ ...source, reviewedAt: "2026-2-24" }], NOW),
    /invalid review date format/,
  );
});

test("rejects future reviews and windows longer than 90 days", () => {
  assert.throws(
    () => validateNewsSources([{ ...source, reviewedAt: "2026-11-25" }], NOW),
    /cannot be in the future/,
  );
  assert.throws(
    () =>
      validateNewsSources([{ ...source, reviewExpiresAt: "2027-02-23" }], NOW),
    /1-90 days/,
  );
});

test("rejects enabled sources without approved rights", () => {
  assert.throws(
    () => validateNewsSources([{ ...source, automationRights: "denied" }], NOW),
    /lacks approved rights/,
  );
});
