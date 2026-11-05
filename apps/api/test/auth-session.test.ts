/**
 * @fileoverview Superfície HTTP de autenticação contra PostgreSQL real:
 * registro, login, refresh rotativo com detecção de reuso e logout.
 * Sem `DATABASE_URL` a suíte é pulada.
 */

import { createHash } from "node:crypto";
import type { Server } from "@hapi/hapi";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { migrate } from "../src/db/migrate.js";
import { makeDb } from "./helpers/db.js";

const DATABASE_URL = process.env.DATABASE_URL;
process.env["DATABASE_URL"] ??= DATABASE_URL;
process.env["ARGON2_PEPPER"] ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env["JWT_ACCESS_SECRET"] ??= "test-only-access-secret-0123456789abcdef";

const { buildServer } = await import("../src/server.js");

const EMAIL = "user@example.com";
const PASSWORD = "correct horse battery staple";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function cookieValue(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const header = Array.isArray(raw) ? raw.join(";") : String(raw ?? "");
  const match = /refresh_token=([^;]+)/.exec(header);
  return match?.[1] ?? "";
}

describe.skipIf(!DATABASE_URL)("auth routes", () => {
  const handle = makeDb(DATABASE_URL ?? "");
  let server: Server;

  beforeAll(async () => {
    await migrate(handle.pool, "up");
    server = await buildServer();

    // Rota só de teste: a rota real de admin chega em #122. Aqui o alvo é
    // provar que um token `user` não satisfaz `access.scope: ['admin']`.
    server.route({
      method: "DELETE",
      path: "/admin/scans/{id}",
      options: {
        auth: { strategy: "jwt", access: { scope: ["admin"] } },
      },
      handler: () => ({ deleted: true }),
    });

    await server.initialize();
  });

  beforeEach(async () => {
    await handle.pool.query(
      "TRUNCATE users, refresh_tokens RESTART IDENTITY CASCADE",
    );
  });

  afterAll(async () => {
    await server.stop({ timeout: 1_000 });
    await handle.destroy();
  });

  async function register(
    email = EMAIL,
    password = PASSWORD,
  ): Promise<{ statusCode: number; result: unknown }> {
    const response = await server.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, password },
    });
    return { statusCode: response.statusCode, result: response.result };
  }

  async function login(
    email = EMAIL,
    password = PASSWORD,
  ): Promise<{
    statusCode: number;
    cookie: string;
    body: Record<string, unknown>;
    headers: Record<string, unknown>;
  }> {
    const response = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });
    return {
      statusCode: response.statusCode,
      cookie: cookieValue(response),
      body: response.result as Record<string, unknown>,
      headers: response.headers,
    };
  }

  test("register stores the user and normalises the e-mail", async () => {
    const created = await register("  USER@Example.COM ");

    expect(created.statusCode).toBe(201);
    expect(created.result).toMatchObject({
      email: "user@example.com",
      role: "user",
    });
    expect(JSON.stringify(created.result)).not.toContain("password");

    const duplicate = await register("user@example.com");
    expect(duplicate.statusCode).toBe(409);
    expect((duplicate.result as { error: { code: string } }).error.code).toBe(
      "duplicate_email",
    );
  });

  test("register enforces the password policy", async () => {
    const tooShort = await register("short@example.com", "short");

    expect(tooShort.statusCode).toBe(400);
    expect((tooShort.result as { error: { code: string } }).error.code).toBe(
      "password_too_short",
    );
  });

  test("login rejects unknown users and wrong passwords identically", async () => {
    await register();

    const unknown = await login("nobody@example.com", PASSWORD);
    const wrong = await login(EMAIL, "wrong password value");

    expect(unknown.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect((unknown.body as { error: { code: string } }).error.code).toBe(
      (wrong.body as { error: { code: string } }).error.code,
    );
  });

  test("login sets an HttpOnly, SameSite=Strict, /auth-scoped cookie", async () => {
    await register();
    const response = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: EMAIL, password: PASSWORD },
    });

    expect(response.statusCode).toBe(200);
    const body = response.result as { accessToken: string; expiresIn: number };
    expect(body.accessToken.split(".")).toHaveLength(3);
    expect(body.expiresIn).toBe(15 * 60);

    const cookie = response.headers["set-cookie"];
    const header = Array.isArray(cookie) ? cookie.join(";") : String(cookie);
    expect(header).toContain("refresh_token=");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Strict");
    expect(header).toContain("Path=/auth");
    expect(header).not.toContain("Secure");
  });

  test("five failures block the next login with 429 and Retry-After", async () => {
    // Servidor próprio: o throttle é por processo e por IP, e o `inject`
    // compartilha 127.0.0.1. Usar o servidor da suíte bloquearia os testes
    // seguintes no sexto login.
    const isolated = await buildServer();
    await isolated.initialize();

    try {
      const email = "throttled@example.com";
      const password = PASSWORD;
      const created = await isolated.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email, password },
      });
      expect(created.statusCode).toBe(201);

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const failed = await isolated.inject({
          method: "POST",
          url: "/auth/login",
          payload: { email, password: "wrong password value" },
        });
        expect(failed.statusCode).toBe(401);
      }

      const blocked = await isolated.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password },
      });
      expect(blocked.statusCode).toBe(429);
      expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    } finally {
      await isolated.stop({ timeout: 1_000 });
    }
  });

  test("/auth/me requires a valid bearer token", async () => {
    await register();
    const { body } = await login();
    const accessToken = String(body["accessToken"]);

    const missing = await server.inject({ method: "GET", url: "/auth/me" });
    expect(missing.statusCode).toBe(401);
    expect(missing.headers["www-authenticate"]).toBe("Bearer");
    expect((missing.result as { error: { code: string } }).error.code).toBe(
      "no_token",
    );

    const tampered = `${accessToken.slice(0, -1)}${accessToken.endsWith("a") ? "b" : "a"}`;
    const invalid = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${tampered}` },
    });
    expect(invalid.statusCode).toBe(401);

    const ok = await server.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.result).toMatchObject({ email: EMAIL, role: "user" });
  });

  test("a user token cannot satisfy an admin scope", async () => {
    await register();
    const { body } = await login();

    const response = await server.inject({
      method: "DELETE",
      url: "/admin/scans/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${String(body["accessToken"])}` },
    });

    expect(response.statusCode).toBe(403);
    expect((response.result as { error: { code: string } }).error.code).toBe(
      "insufficient_scope",
    );
  });

  test("refresh rotates the token and stores only its sha256", async () => {
    await register();
    const first = await login();

    const refreshed = await server.inject({
      method: "POST",
      url: "/auth/refresh",
      headers: { cookie: `refresh_token=${first.cookie}` },
    });

    expect(refreshed.statusCode).toBe(200);
    const nextCookie = cookieValue(refreshed);
    expect(nextCookie).not.toBe(first.cookie);

    const { rows } = await handle.pool.query<{
      token_hash: string;
      rotated_at: Date | null;
      revoked_at: Date | null;
    }>("SELECT token_hash, rotated_at, revoked_at FROM refresh_tokens");

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.token_hash).sort()).toEqual(
      [sha256(first.cookie), sha256(nextCookie)].sort(),
    );
    expect(rows.every((row) => row.token_hash !== first.cookie)).toBe(true);
    expect(rows.every((row) => row.token_hash !== nextCookie)).toBe(true);
    expect(rows.filter((row) => row.rotated_at !== null)).toHaveLength(1);
  });

  test("replaying a rotated token revokes the whole family and logs it", async () => {
    await register();
    const first = await login();
    const refreshed = await server.inject({
      method: "POST",
      url: "/auth/refresh",
      headers: { cookie: `refresh_token=${first.cookie}` },
    });
    const nextCookie = cookieValue(refreshed);

    const audit: Array<{ tags?: string[] }> = [];
    const listener = (event: { tags?: string[] }): void => {
      if (event.tags?.includes("refresh_token_reuse")) audit.push(event);
    };
    server.events.on("log", listener);

    const replay = await server.inject({
      method: "POST",
      url: "/auth/refresh",
      headers: { cookie: `refresh_token=${first.cookie}` },
    });
    expect(replay.statusCode).toBe(401);

    server.events.removeListener("log", listener);

    const after = await server.inject({
      method: "POST",
      url: "/auth/refresh",
      headers: { cookie: `refresh_token=${nextCookie}` },
    });
    expect(after.statusCode).toBe(401);

    const { rows } = await handle.pool.query<{ revoked_at: Date | null }>(
      "SELECT revoked_at FROM refresh_tokens",
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.revoked_at !== null)).toBe(true);
    expect(audit).toHaveLength(1);
  });

  test("logout revokes the family and clears the cookie", async () => {
    await register();
    const { cookie } = await login();

    const logout = await server.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie: `refresh_token=${cookie}` },
    });

    expect(logout.statusCode).toBe(204);
    expect(String(logout.headers["set-cookie"])).toContain("Max-Age=0");

    const refreshed = await server.inject({
      method: "POST",
      url: "/auth/refresh",
      headers: { cookie: `refresh_token=${cookie}` },
    });
    expect(refreshed.statusCode).toBe(401);
  });
});
