/**
 * @fileoverview Envelope de erro: código estável, requestId, 500 opaco,
 * 2xx intocado e 503 quando o pool está degradado.
 */

import type { Server } from "@hapi/hapi";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ConflictError, NotFoundError } from "../src/errors/index.js";

process.env["DATABASE_URL"] ??=
  "postgresql://postgres:postgres@localhost:5432/chaintelescope_test";
process.env["ARGON2_PEPPER"] ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env["JWT_ACCESS_SECRET"] ??= "test-only-access-secret-0123456789abcdef";

const { buildServer } = await import("../src/server.js");

interface ErrorBody {
  error: { code: string; message: string; requestId: string };
}

describe("error envelope", () => {
  let server: Server;

  beforeAll(async () => {
    server = await buildServer();
    server.route([
      {
        method: "GET",
        path: "/test/ok",
        handler: () => ({ ok: true }),
      },
      {
        method: "GET",
        path: "/test/not-found",
        handler: () => {
          throw new NotFoundError("scan_not_found", "Scan not found");
        },
      },
      {
        method: "GET",
        path: "/test/conflict",
        handler: () => {
          throw new ConflictError("duplicate_subscription");
        },
      },
      {
        method: "GET",
        path: "/test/crash",
        handler: () => {
          throw new Error("boom: internal detail");
        },
      },
    ]);
    await server.initialize();
  });

  afterAll(async () => {
    await server.stop({ timeout: 1_000 });
  });

  test("a domain 404 carries its stable code and the request id", async () => {
    const response = await server.inject("/test/not-found");

    expect(response.statusCode).toBe(404);
    const body = response.result as ErrorBody;
    expect(body.error.code).toBe("scan_not_found");
    expect(body.error.message).toBe("Scan not found");
    expect(body.error.requestId).toBeTypeOf("string");
    expect(body.error.requestId.length).toBeGreaterThan(0);
  });

  test("a domain 409 keeps its code and does not send WWW-Authenticate", async () => {
    const response = await server.inject("/test/conflict");

    expect(response.statusCode).toBe(409);
    expect((response.result as ErrorBody).error.code).toBe(
      "duplicate_subscription",
    );
    expect(response.headers["www-authenticate"]).toBeUndefined();
  });

  test("unknown routes are 404 not_found", async () => {
    const response = await server.inject("/does-not-exist");

    expect(response.statusCode).toBe(404);
    expect((response.result as ErrorBody).error.code).toBe("not_found");
  });

  test("an unclassified throw is 500 with a generic body and a log", async () => {
    const events: Array<{ tags?: string[]; data?: unknown }> = [];
    const listener = (
      _request: unknown,
      event: { tags?: string[]; data?: unknown },
      tags: Record<string, boolean>,
    ): void => {
      if (tags["internal"]) events.push(event);
    };
    server.events.on("request", listener);

    const response = await server.inject("/test/crash");

    server.events.removeListener("request", listener);

    expect(response.statusCode).toBe(500);
    const body = response.result as ErrorBody;
    expect(body.error.code).toBe("internal_error");
    expect(body.error.message).toBe("An internal server error occurred");
    expect(body.error.requestId).toBeTypeOf("string");
    expect(response.payload).not.toContain("boom");
    expect(response.payload).not.toContain("stack");
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toMatchObject({
      code: "internal_error",
      requestId: body.error.requestId,
    });
  });

  test("a successful response is untouched", async () => {
    const response = await server.inject("/test/ok");

    expect(response.statusCode).toBe(200);
    expect(response.result).toEqual({ ok: true });
    expect(response.payload).not.toContain("requestId");
  });

  test("401 is the only status that carries WWW-Authenticate", async () => {
    const unauthorized = await server.inject("/auth/me");
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.headers["www-authenticate"]).toBe("Bearer");

    const notFound = await server.inject("/does-not-exist");
    expect(notFound.headers["www-authenticate"]).toBeUndefined();
  });

  test("a degraded pool short-circuits to 503 with Retry-After", async () => {
    server.app.degraded = true;
    try {
      const response = await server.inject("/healthz");

      expect(response.statusCode).toBe(503);
      expect((response.result as ErrorBody).error.code).toBe(
        "db_pool_saturated",
      );
      expect(response.headers["retry-after"]).toBe("5");
    } finally {
      server.app.degraded = false;
    }
  });
});
