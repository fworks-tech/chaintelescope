/** @fileoverview Contratos de boot: CORS_ORIGINS nunca aceita wildcard. */

import { describe, expect, test } from "vitest";

process.env["DATABASE_URL"] ??=
  "postgresql://postgres:postgres@localhost:5432/chaintelescope_test";
process.env["ARGON2_PEPPER"] ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env["JWT_ACCESS_SECRET"] ??= "test-only-access-secret-0123456789abcdef";

const { loadEnv } = await import("../src/env.js");

const base = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/db",
  ARGON2_PEPPER:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  JWT_ACCESS_SECRET: "test-only-access-secret-0123456789abcdef",
};

describe("CORS allowlist validation", () => {
  test("refuses a wildcard in production", () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: "production", CORS_ORIGINS: "*" }),
    ).toThrow(/CORS_ORIGINS/);
  });

  test("refuses a wildcard in development too", () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: "development", CORS_ORIGINS: "*" }),
    ).toThrow(/CORS_ORIGINS/);
  });

  test("refuses an entry that is not an absolute URL", () => {
    expect(() =>
      loadEnv({ ...base, CORS_ORIGINS: "http://localhost:3000,not-a-url" }),
    ).toThrow(/CORS_ORIGINS/);
  });

  test("normalises a comma-separated allowlist", () => {
    const env = loadEnv({
      ...base,
      CORS_ORIGINS: " http://localhost:3000 , https://app.example.com ",
    });

    expect(env.CORS_ORIGINS).toBe(
      "http://localhost:3000,https://app.example.com",
    );
  });
});

describe("PG* database fallback (ECS pattern)", () => {
  const parts = {
    PGHOST: "db.example.internal",
    PGUSER: "ct",
    PGPASSWORD: "s3cret",
    PGDATABASE: "chaintelescope",
  };

  test("composes DATABASE_URL from PG* parts with the default port", async () => {
    const { loadDatabaseUrl } = await import("../src/env-db.js");
    expect(loadDatabaseUrl({ ...parts })).toBe(
      "postgresql://ct:s3cret@db.example.internal:5432/chaintelescope",
    );
  });

  test("an explicit DATABASE_URL wins over PG* parts", async () => {
    const { loadDatabaseUrl } = await import("../src/env-db.js");
    expect(
      loadDatabaseUrl({ ...parts, DATABASE_URL: "postgresql://x:y@h:5432/d" }),
    ).toBe("postgresql://x:y@h:5432/d");
  });

  test("percent-encodes user and password", async () => {
    const { loadDatabaseUrl } = await import("../src/env-db.js");
    expect(
      loadDatabaseUrl({ ...parts, PGUSER: "u@x", PGPASSWORD: "p:a/ss" }),
    ).toBe(
      "postgresql://u%40x:p%3Aa%2Fss@db.example.internal:5432/chaintelescope",
    );
  });

  test("rejects incomplete parts without DATABASE_URL", async () => {
    const { loadDatabaseUrl } = await import("../src/env-db.js");
    expect(() => loadDatabaseUrl({ PGHOST: "h" })).toThrow(
      /Configuration contract violation/,
    );
  });

  test("enables SSL for non-loopback hosts, off for localhost", async () => {
    const { resolvePgSsl } = await import("../src/env-db.js");
    expect(
      resolvePgSsl("postgresql://ct:s@db.example.internal:5432/chaintelescope"),
    ).toEqual({ rejectUnauthorized: false });
    expect(
      resolvePgSsl("postgresql://postgres:postgres@localhost:5432/chaintelescope_dev"),
    ).toBeUndefined();
    expect(resolvePgSsl("not a url")).toBeUndefined();
  });

  test("loadEnv exposes the composed URL as DATABASE_URL", () => {
    const { PGHOST, PGUSER, PGPASSWORD, PGDATABASE } = parts;
    const env = loadEnv({
      ...base,
      DATABASE_URL: undefined,
      PGHOST,
      PGUSER,
      PGPASSWORD,
      PGDATABASE,
    });
    expect(env.DATABASE_URL).toBe(
      "postgresql://ct:s3cret@db.example.internal:5432/chaintelescope",
    );
  });
});
