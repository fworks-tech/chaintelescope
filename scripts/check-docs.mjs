/**
 * Docs drift check: every relative link under docs must resolve, and
 * every ADR (docs/adr/000N) and spec (docs/spec) must be listed
 * in docs/README.md. Zero dependencies. Run: `node scripts/check-docs.mjs`.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const DOCS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "docs");
const INDEX = join(DOCS_DIR, "README.md");

/** Inline markdown links and asset sources, minus external URLs and pure anchors. */
export function extractRelativeLinks(markdown) {
  const targets = [];
  for (const match of markdown.matchAll(/\]\(([^)\s]+)\)/g)) {
    targets.push(match[1]);
  }
  for (const match of markdown.matchAll(/src="([^"]+)"/g)) {
    targets.push(match[1]);
  }
  return targets.filter(
    (t) =>
      t.length > 0 &&
      !t.startsWith("http://") &&
      !t.startsWith("https://") &&
      !t.startsWith("mailto:") &&
      !t.startsWith("#") &&
      !t.startsWith("/"),
  );
}

export function listMarkdownFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listMarkdownFiles(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/** Returns `["file -> target", ...]` for every unresolvable relative link. */
export function checkLinks(docsDir = DOCS_DIR) {
  const broken = [];
  for (const file of listMarkdownFiles(docsDir)) {
    const base = dirname(file);
    for (const target of extractRelativeLinks(readFileSync(file, "utf8"))) {
      const clean = target.split("#")[0];
      if (clean.length === 0) continue;
      try {
        statSync(resolve(base, clean));
      } catch {
        broken.push(`${file} -> ${target}`);
      }
    }
  }
  return broken;
}

/** Returns canonical ADRs/specs missing from the docs index. */
export function checkIndex(docsDir = DOCS_DIR, indexFile = INDEX) {
  const index = readFileSync(indexFile, "utf8");
  const missing = [];
  for (const sub of ["adr", "spec"]) {
    const dir = join(docsDir, sub);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      if (entry.name === "README.md") continue;
      if (!index.includes(`${sub}/${entry.name}`)) {
        missing.push(`${sub}/${entry.name}`);
      }
    }
  }
  return missing;
}

const broken = checkLinks();
const unindexed = checkIndex();
for (const line of broken) console.error(`broken link: ${line}`);
for (const line of unindexed) console.error(`unindexed: ${line}`);
if (broken.length > 0 || unindexed.length > 0) {
  console.error(
    `check-docs failed: ${broken.length} broken links, ${unindexed.length} unindexed files`,
  );
  process.exit(1);
}
console.log("check-docs: links resolve, index is complete");
