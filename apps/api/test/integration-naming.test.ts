import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));

describe("integration test naming guard (#162)", () => {
  it("keeps database suites out of the unit bucket", () => {
    const offenders = readdirSync(testDir)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".integration.test.ts"))
      .filter((name) => {
        const source = readFileSync(join(testDir, name), "utf8");
        return /from\s+["']\.\/helpers\/db(?:\.js)?["']/.test(source);
      });

    expect(
      offenders,
      offenders
        .map(
          (name) =>
            `${name} imports ./helpers/db.js but is not named *.integration.test.ts; ` +
            "rename it so the default unit run does not load a database suite",
        )
        .join("\n"),
    ).toEqual([]);
  });
});
