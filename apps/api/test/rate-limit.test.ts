/**
 * @fileoverview Token bucket: unidade com relógio congelado e integração nas
 * rotas /scans, /auth/login e exclusão de /healthz.
 */

import type { Server } from "@hapi/hapi";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { TokenBucketLimiter } from "../src/plugins/rate-limit.js";
import { migrate } from "../src/db/migrate.js";
import { makeDb } from "./helpers/db.js";

const DATABASE_URL = process.env.DATABASE_URL;
process.env["DATABASE_URL"] ??= DATABASE_URL;
process.env["ARGON2_PEPPER"] ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env["JWT_ACCESS_SECRET"] ??= "test-only-access-secret-0123456789abcdef";

const { buildServer } = await import("../src/server.js");

describe("token bucket", () => {
  test("refills at the configured rate and reports the wait", async () => {
    let now = 0;
    const limiter = new TokenBucketLimiter(
      { capacity: 2, refillPerSec: 1 },
      () => now,
    );

    expect((await limiter.tryConsume("ip")).allowed).toBe(true);
    expect((await limiter.tryConsume("ip")).allowed).toBe(true);

    const denied = await limiter.tryConsume("ip");
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBe(1);

    // Outra chave tem o próprio balde.
    expect((await limiter.tryConsume("other")).allowed).toBe(true);

    now = 1_000;
    expect((await limiter.tryConsume("ip")).allowed).toBe(true);
  });
});

describe.skipIf(!DATABASE_URL)("rate limit routes", () => {
  const handle = makeDb(DATABASE_URL ?? "");
  let server: Server;
  let healthServer: Server;
  const now = 1_000_000;

  beforeAll(async () => {
    await migrate(handle.pool, "up");
    server = await buildServer(undefined, {
      rateLimit: { now: () => now },
    });
    healthServer = await buildServer(undefined, {
      rateLimit: {
        now: () => now,
        rules: [
          { prefix: "/healthz", capacity: 1, refillPerSec: 0.001 },
          { prefix: "/scans", capacity: 30, refillPerSec: 30 / 60 },
        ],
      },
    });
    await server.initialize();
    await healthServer.initialize();
  });

  afterAll(async () => {
    await server.stop({ timeout: 1_000 });
    await healthServer.stop({ timeout: 1_000 });
    await handle.destroy();
  });

  test("the 31st /scans request in the window is 429 with Retry-After", async () => {
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      expect((await server.inject("/scans")).statusCode).toBe(200);
    }

    const blocked = await server.inject("/scans");

    expect(blocked.statusCode).toBe(429);
    expect((blocked.result as { error: { code: string } }).error.code).toBe(
      "rate_limited",
    );
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  });

  test("login is stricter than the rest of /auth", async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await server.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "nobody@example.com", password: "wrong password" },
      });
      expect(response.statusCode).toBe(401);
    }

    const blocked = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "nobody@example.com", password: "wrong password" },
    });

    expect(blocked.statusCode).toBe(429);
    expect((blocked.result as { error: { code: string } }).error.code).toBe(
      "rate_limited",
    );
  });

  test("health endpoints are exempt even when a rule matches them", async () => {
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      expect((await healthServer.inject("/healthz")).statusCode).toBe(200);
    }
  });
});
