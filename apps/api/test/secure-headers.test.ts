/**
 * @fileoverview Headers de segurança em 2xx/4xx/5xx e CORS por allowlist,
 * com `Access-Control-Allow-Origin: *` sempre ausente.
 */

import type { Server } from "@hapi/hapi";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { SECURITY_HEADERS } from "../src/plugins/secure-headers.js";

process.env["DATABASE_URL"] ??=
  "postgresql://postgres:postgres@localhost:5432/chaintelescope_test";
process.env["ARGON2_PEPPER"] ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env["JWT_ACCESS_SECRET"] ??= "test-only-access-secret-0123456789abcdef";

const { buildServer } = await import("../src/server.js");

function assertHeaders(headers: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    expect(headers[name]).toBe(value);
  }
}

describe("secure headers and CORS", () => {
  let server: Server;

  beforeAll(async () => {
    server = await buildServer();
    server.route({
      method: "GET",
      path: "/test/explode",
      handler: () => {
        throw new Error("boom");
      },
    });
    await server.initialize();
  });

  afterAll(async () => {
    await server.stop({ timeout: 1_000 });
  });

  test("a 200 carries all five headers", async () => {
    const response = await server.inject("/healthz");

    expect(response.statusCode).toBe(200);
    assertHeaders(response.headers);
  });

  test("a 404 from the error envelope still carries them", async () => {
    const response = await server.inject("/does-not-exist");

    expect(response.statusCode).toBe(404);
    assertHeaders(response.headers);
  });

  test("a 500 still carries them", async () => {
    const response = await server.inject("/test/explode");

    expect(response.statusCode).toBe(500);
    assertHeaders(response.headers);
  });

  test("an allowed origin is echoed on preflight", async () => {
    const response = await server.inject({
      method: "OPTIONS",
      url: "/scans",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "POST",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000",
    );
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  test("a disallowed origin gets no allow-origin header", async () => {
    const response = await server.inject({
      method: "OPTIONS",
      url: "/scans",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "POST",
      },
    });

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("the wildcard is never echoed", async () => {
    for (const origin of ["http://localhost:3000", "https://evil.example"]) {
      const response = await server.inject({
        method: "OPTIONS",
        url: "/scans",
        headers: { origin, "access-control-request-method": "POST" },
      });
      expect(response.headers["access-control-allow-origin"]).not.toBe("*");
    }
  });
});
