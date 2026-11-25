/**
 * Syncs the canonical news-source registry into the slim-safe Python artifact.
 * Never hand-edit the JSON: CI regenerates it and fails on drift.
 *
 * Usage: `pnpm sync:news-sources` (builds @chaintelescope/shared first).
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

export function parseReviewDate(value, key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`sync:news-sources: invalid review date format: ${key}`);
  }
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(parsed) ||
    new Date(parsed).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`sync:news-sources: impossible review date: ${key}`);
  }
  return parsed;
}

export function validateNewsSources(sources, now = Date.now()) {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error(
      "sync:news-sources: NEWS_SOURCES is empty, refusing to write",
    );
  }

  const keys = new Set();
  const urls = new Set();
  for (const source of sources) {
    if (keys.has(source.key) || urls.has(source.feedUrl)) {
      throw new Error(
        `sync:news-sources: duplicate source key or URL: ${source.key}`,
      );
    }
    keys.add(source.key);
    urls.add(source.feedUrl);
    if (!source.feedUrl.startsWith("https://")) {
      throw new Error(
        `sync:news-sources: source URL must use HTTPS: ${source.key}`,
      );
    }
    const reviewedAt = parseReviewDate(source.reviewedAt, source.key);
    const reviewExpiresAt = parseReviewDate(source.reviewExpiresAt, source.key);
    const reviewDays = (reviewExpiresAt - reviewedAt) / 86_400_000;
    if (!Number.isFinite(reviewDays) || reviewDays <= 0 || reviewDays > 90) {
      throw new Error(
        `sync:news-sources: review window must be 1-90 days: ${source.key}`,
      );
    }
    if (reviewedAt > now) {
      throw new Error(
        `sync:news-sources: review date cannot be in the future: ${source.key}`,
      );
    }
    if (
      !Number.isInteger(source.pollIntervalMinutes) ||
      source.pollIntervalMinutes <= 0
    ) {
      throw new Error(
        `sync:news-sources: polling interval must be a positive integer: ${source.key}`,
      );
    }
    if (
      source.enabled &&
      (source.automationRights !== "approved" ||
        source.metadataRights !== "approved")
    ) {
      throw new Error(
        `sync:news-sources: enabled source lacks approved rights: ${source.key}`,
      );
    }
    if (
      source.imageRights === "hotlink-approved" &&
      source.allowedImageHosts.length === 0
    ) {
      throw new Error(
        `sync:news-sources: hotlink source lacks image hosts: ${source.key}`,
      );
    }
  }
}

export async function syncNewsSources() {
  let registry;
  try {
    registry = await import("../packages/shared/dist/news-sources.js");
  } catch (err) {
    console.error(
      "sync:news-sources: build @chaintelescope/shared first (`pnpm build:shared`)",
    );
    throw err;
  }

  const { NEWS_SOURCES } = registry;
  validateNewsSources(NEWS_SOURCES);
  const payload = {
    _generated:
      "do not edit by hand; run `pnpm sync:news-sources` (source: packages/shared/src/news-sources.ts)",
    sources: NEWS_SOURCES,
  };

  const out = join(root, "apps/python/src/data/news/sources.generated.json");
  writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`sync:news-sources: ${NEWS_SOURCES.length} sources -> ${out}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await syncNewsSources();
}
