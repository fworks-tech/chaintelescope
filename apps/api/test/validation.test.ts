/**
 * @fileoverview Pipeline de validação: JSON malformado é 400 (parser do Hapi),
 * schema violado é 422, e o corpo não vaza mensagens internas do Joi.
 */

import {
  CreateScanPayloadSchema,
  RegisterPayloadSchema,
} from "@chaintelescope/shared";
import type { Server } from "@hapi/hapi";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

process.env["DATABASE_URL"] ??=
  "postgresql://postgres:postgres@localhost:5432/chaintelescope_test";
process.env["ARGON2_PEPPER"] ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env["JWT_ACCESS_SECRET"] ??= "test-only-access-secret-0123456789abcdef";

const { buildServer } = await import("../src/server.js");

describe("Joi validation pipeline", () => {
  let server: Server;

  beforeAll(async () => {
    server = await buildServer();

    // A rota de scans real chega em #122; aqui o alvo é o contrato compartilhado.
    server.route({
      method: "POST",
      path: "/test/scans",
      options: { validate: { payload: CreateScanPayloadSchema } },
      handler: (request) => request.payload,
    });

    await server.initialize();
  });

  afterAll(async () => {
    await server.stop({ timeout: 1_000 });
  });

  test("unparseable JSON is 400 and never reaches the schema", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/test/scans",
      payload: '{"kind":',
      headers: { "content-type": "application/json" },
    });

    expect(response.statusCode).toBe(400);
  });

  test("a well-formed body with an invalid enum is 422", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/test/scans",
      payload: { kind: "bogus" },
    });

    expect(response.statusCode).toBe(422);
    const body = response.result as {
      error: { code: string; message: string; requestId: string };
      details: Array<{ path: string; type: string }>;
    };
    expect(body.error.code).toBe("semantic_validation");
    expect(body.error.message).toBe("Payload validation failed");
    expect(body.error.requestId).toBeTypeOf("string");
    expect(body.details).toEqual([{ path: "kind", type: "any.only" }]);
    expect(response.payload).not.toContain("Joi");
  });

  test("a missing required key is 422 with details.path", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/test/scans",
      payload: {},
    });

    expect(response.statusCode).toBe(422);
    expect(
      (response.result as { details: Array<{ path: string; type: string }> })
        .details,
    ).toEqual([{ path: "kind", type: "any.required" }]);
  });

  test("assetSymbol is required for snapshots and transformed to uppercase", async () => {
    const missing = await server.inject({
      method: "POST",
      url: "/test/scans",
      payload: { kind: "snapshot" },
    });
    expect(missing.statusCode).toBe(422);
    expect(
      (missing.result as { details: Array<{ path: string }> }).details[0]?.path,
    ).toBe("assetSymbol");

    const optionalForFeeds = await server.inject({
      method: "POST",
      url: "/test/scans",
      payload: { kind: "feed", assetSymbol: "btc" },
    });
    expect(optionalForFeeds.statusCode).toBe(200);
    expect(optionalForFeeds.result).toMatchObject({ assetSymbol: "BTC" });
  });

  test("unknown keys are rejected instead of silently stored", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/test/scans",
      payload: { kind: "feed", admin: true },
    });

    expect(response.statusCode).toBe(422);
    expect(
      (response.result as { details: Array<{ type: string }> }).details[0]
        ?.type,
    ).toBe("object.unknown");
  });

  test("the response details come from the shared schema", async () => {
    const { error } = CreateScanPayloadSchema.validate(
      { kind: "bogus" },
      { abortEarly: false },
    );
    const response = await server.inject({
      method: "POST",
      url: "/test/scans",
      payload: { kind: "bogus" },
    });

    expect((response.result as { details: unknown }).details).toEqual(
      error?.details.map((detail) => ({
        path: detail.path.join("."),
        type: detail.type,
      })),
    );
  });

  test("auth routes validate their payload before the handler", async () => {
    const missingPassword = await server.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "person@example.com" },
    });
    expect(missingPassword.statusCode).toBe(422);
    expect(
      (missingPassword.result as { details: Array<{ path: string }> })
        .details[0]?.path,
    ).toBe("password");

    const invalidEmail = await server.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: "not-an-email", password: "long enough password" },
    });
    expect(invalidEmail.statusCode).toBe(422);
    expect(
      (invalidEmail.result as { details: Array<{ path: string }> }).details[0]
        ?.path,
    ).toBe("email");

    const malformed = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: "{",
      headers: { "content-type": "application/json" },
    });
    expect(malformed.statusCode).toBe(400);
  });

  test("the shared register contract types match its schema", () => {
    // Se um campo do schema não existir na interface, `Joi.object<T, true>`
    // nem compila; este teste guarda o par obrigatório que o cliente usa.
    expect(RegisterPayloadSchema.describe().keys).toHaveProperty("email");
    expect(RegisterPayloadSchema.describe().keys).toHaveProperty("password");
  });
});
