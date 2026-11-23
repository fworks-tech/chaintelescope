import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  checkIndex,
  checkLinks,
  extractRelativeLinks,
} from "./check-docs.mjs";

test("extractRelativeLinks skips external URLs and anchors", () => {
  const links = extractRelativeLinks(
    "[a](other.md) [b](https://x.y) [c](#frag) [d](sub/page.md#frag) ![e](img.png)",
  );
  assert.deepEqual(links, ["other.md", "sub/page.md#frag", "img.png"]);
});

test("checkLinks reports unresolvable targets", () => {
  const root = mkdtempSync(join(tmpdir(), "check-docs-"));
  writeFileSync(join(root, "ok.md"), "[x](sub/there.md)");
  writeFileSync(join(root, "bad.md"), "[x](missing.md)");
  mkdirSync(join(root, "sub"));
  writeFileSync(join(root, "sub", "there.md"), "# hi");
  assert.deepEqual(checkLinks(root), [`${join(root, "bad.md")} -> missing.md`]);
});

test("checkIndex reports canonical files missing from the index", () => {
  const root = mkdtempSync(join(tmpdir(), "check-docs-idx-"));
  mkdirSync(join(root, "adr"));
  mkdirSync(join(root, "spec"));
  writeFileSync(join(root, "adr", "0001-x.md"), "# x");
  writeFileSync(join(root, "spec", "100-y.md"), "# y");
  const index = join(root, "README.md");
  writeFileSync(index, "- [adr/0001-x.md](adr/0001-x.md)\n");
  assert.deepEqual(checkIndex(root, index), ["spec/100-y.md"]);
});
