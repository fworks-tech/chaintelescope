import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "@hapi/hapi";

// Configura variáveis antes de importar o env.ts
process.env["DATABASE_URL"] =
  "postgresql://postgres:postgres@localhost:5432/hasheyes_test";
process.env["ARGON2_PEPPER"] =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const { buildServer } = await import("../src/server.js");

describe("Hapi.js Server Bootstrap", () => {
  let server: Server;

  beforeAll(async () => {
    server = await buildServer();
    await server.initialize(); // Inicializa plugins e lifecycle sem ouvir na porta de rede
  });

  afterAll(async () => {
    await server.stop({ timeout: 1000 });
  });

  it("should register db-pool plugin and decorate server.db", () => {
    expect(server.db).toBeDefined();

    // Cast para Record<string, unknown> resolve o índice estrito
    const registrations = server.registrations as Record<string, unknown>;
    expect(registrations["db-pool"]).toBeDefined();
  });

  it("should respond 200 OK to GET /healthz via server.inject()", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/healthz",
    });

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload) as { status: string };
    expect(payload.status).toBe("ok");
  });
});
