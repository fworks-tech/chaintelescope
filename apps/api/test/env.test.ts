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
