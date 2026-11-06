/**
 * @fileoverview Matriz de contrato: para cada rota, os status esperados em
 * anônimo/user/admin/payload inválido/recurso ausente/conflito. A cobertura é
 * verificada contra `server.table()`, não a olho.
 */

import { randomUUID } from "node:crypto";
import type { Server } from "@hapi/hapi";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { signAccessToken } from "../src/auth/tokens.js";
import { AuthRepo } from "../src/db/repos/auth.js";
import { migrate } from "../src/db/migrate.js";
import { ScansRepo } from "../src/db/repos/scans.js";
import { makeDb } from "./helpers/db.js";

const DATABASE_URL = process.env.DATABASE_URL;
process.env["DATABASE_URL"] ??= DATABASE_URL;
process.env["ARGON2_PEPPER"] ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const JWT_SECRET =
  process.env["JWT_ACCESS_SECRET"] ?? "test-only-access-secret-0123456789abcdef";
process.env["JWT_ACCESS_SECRET"] = JWT_SECRET;

const { buildServer } = await import("../src/server.js");

type Scenario =
  | "anonymous"
  | "user"
  | "admin"
  | "invalidPayload"
  | "missingResource"
  | "conflict";

interface RequestSpec {
  readonly method: string;
  readonly url: string;
  readonly payload?: unknown;
  readonly headers?: Record<string, string>;
}

interface MatrixRow {
  readonly method: string;
  readonly route: string;
  readonly expected: Partial<Record<Scenario, number>>;
  readonly request: Partial<Record<Scenario, () => RequestSpec>>;
}

interface Context {
  readonly server: Server;
  readonly userToken: string;
  readonly adminToken: string;
  readonly missingId: string;
  readonly cancelId: string;
  readonly deleteId: string;
  readonly refreshCookie: string;
  readonly logoutCookie: string;
}

const userAuth = (ctx: Context): Record<string, string> => ({
  authorization: `Bearer ${ctx.userToken}`,
});
const adminAuth = (ctx: Context): Record<string, string> => ({
  authorization: `Bearer ${ctx.adminToken}`,
});
const uuid = (): string => randomUUID();
const MATRIX_PASSWORD = "matrix password 123";

function cookieToken(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const header = Array.isArray(raw) ? String(raw[0]) : String(raw);
  return header.split(";")[0]!.replace("refresh_token=", "");
}

describe.skipIf(!DATABASE_URL)("route status matrix", () => {
  const handle = makeDb(DATABASE_URL ?? "");
  const scans = new ScansRepo(handle.db);
  const users = new AuthRepo(handle.db);
  const ctx = { missingId: uuid() } as Context;
  let matrix: MatrixRow[];

  beforeAll(async () => {
    await migrate(handle.pool, "up");
    await handle.pool.query(
      "TRUNCATE users, refresh_tokens, scans, scan_artifacts, scan_matches, newsletter_subscriptions RESTART IDENTITY CASCADE",
    );

    ctx.server = await buildServer(undefined, {
      rateLimit: { enabled: false },
    });
    await ctx.server.initialize();

    const register = (email: string) =>
      ctx.server.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email, password: MATRIX_PASSWORD },
      });

    await register("matrix-user@example.com");
    await register("matrix-admin@example.com");
    await handle.pool.query(
      "UPDATE users SET role = 'admin' WHERE email = $1",
      ["matrix-admin@example.com"],
    );

    const user = await users.userByEmail("matrix-user@example.com");
    const admin = await users.userByEmail("matrix-admin@example.com");
    (ctx as { userToken: string }).userToken = signAccessToken(
      user!.id,
      ["user"],
      JWT_SECRET,
      "15m",
    ).token;
    (ctx as { adminToken: string }).adminToken = signAccessToken(
      admin!.id,
      ["user", "admin"],
      JWT_SECRET,
      "15m",
    ).token;

    // Cookie de refresh e de logout vêm de logins reais.
    const login = await ctx.server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "matrix-user@example.com",
        password: MATRIX_PASSWORD,
      },
    });
    (ctx as { refreshCookie: string }).refreshCookie = cookieToken(login);

    const logout = await ctx.server.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "matrix-user@example.com",
        password: MATRIX_PASSWORD,
      },
    });
    (ctx as { logoutCookie: string }).logoutCookie = cookieToken(logout);

    const existing = await scans.create({
      kind: "feed",
      requestor: user!.id,
    });
    const cancellable = await scans.create({ kind: "feed" });
    const deletable = await scans.create({ kind: "feed" });
    const cancelled = await scans.create({ kind: "feed" });
    await scans.transition(cancelled.id, "pending", "cancelled");

    (ctx as { existingScanId?: string }).existingScanId = existing.id;
    (ctx as { cancelId: string }).cancelId = cancellable.id;
    (ctx as { deleteId: string }).deleteId = deletable.id;
    (ctx as { cancelledId?: string }).cancelledId = cancelled.id;

    await ctx.server.inject({
      method: "POST",
      url: "/newsletter/subscribe",
      payload: { email: "matrix-news@example.com" },
    });

    matrix = [
      {
        method: "GET",
        route: "/healthz",
        expected: { anonymous: 200 },
        request: { anonymous: () => ({ method: "GET", url: "/healthz" }) },
      },
      {
        method: "POST",
        route: "/auth/register",
        expected: { anonymous: 201, invalidPayload: 422, conflict: 409 },
        request: {
          anonymous: () => ({
            method: "POST",
            url: "/auth/register",
            payload: {
              email: "matrix-register@example.com",
              password: "matrix password 123",
            },
          }),
          invalidPayload: () => ({
            method: "POST",
            url: "/auth/register",
            payload: { email: "not-an-email" },
          }),
          conflict: () => ({
            method: "POST",
            url: "/auth/register",
            payload: {
              email: "matrix-user@example.com",
              password: "matrix password 123",
            },
          }),
        },
      },
      {
        method: "POST",
        route: "/auth/login",
        expected: { anonymous: 200, invalidPayload: 422, conflict: 401 },
        request: {
          anonymous: () => ({
            method: "POST",
            url: "/auth/login",
            payload: {
              email: "matrix-user@example.com",
              password: MATRIX_PASSWORD,
            },
          }),
          invalidPayload: () => ({
            method: "POST",
            url: "/auth/login",
            payload: {},
          }),
          conflict: () => ({
            method: "POST",
            url: "/auth/login",
            payload: { email: "matrix-user@example.com", password: "wrong" },
          }),
        },
      },
      {
        method: "POST",
        route: "/auth/refresh",
        expected: { anonymous: 401, user: 200, invalidPayload: 401 },
        request: {
          anonymous: () => ({ method: "POST", url: "/auth/refresh" }),
          user: () => ({
            method: "POST",
            url: "/auth/refresh",
            headers: { cookie: `refresh_token=${ctx.refreshCookie}` },
          }),
          invalidPayload: () => ({
            method: "POST",
            url: "/auth/refresh",
            headers: { cookie: "refresh_token=not-a-token" },
          }),
        },
      },
      {
        method: "POST",
        route: "/auth/logout",
        expected: { anonymous: 204, user: 204 },
        request: {
          anonymous: () => ({ method: "POST", url: "/auth/logout" }),
          user: () => ({
            method: "POST",
            url: "/auth/logout",
            headers: { cookie: `refresh_token=${ctx.logoutCookie}` },
          }),
        },
      },
      {
        method: "GET",
        route: "/auth/me",
        expected: { anonymous: 401, user: 200, admin: 200 },
        request: {
          anonymous: () => ({ method: "GET", url: "/auth/me" }),
          user: () => ({
            method: "GET",
            url: "/auth/me",
            headers: userAuth(ctx),
          }),
          admin: () => ({
            method: "GET",
            url: "/auth/me",
            headers: adminAuth(ctx),
          }),
        },
      },
      {
        method: "POST",
        route: "/scans",
        expected: {
          anonymous: 401,
          user: 201,
          admin: 201,
          invalidPayload: 415,
        },
        request: {
          anonymous: () => ({
            method: "POST",
            url: "/scans",
            payload: Buffer.from("matrix"),
            headers: { "content-type": "application/octet-stream" },
          }),
          user: () => ({
            method: "POST",
            url: "/scans",
            payload: Buffer.from("matrix"),
            headers: {
              "content-type": "application/octet-stream",
              ...userAuth(ctx),
            },
          }),
          admin: () => ({
            method: "POST",
            url: "/scans",
            payload: Buffer.from("matrix-admin"),
            headers: {
              "content-type": "application/octet-stream",
              ...adminAuth(ctx),
            },
          }),
          invalidPayload: () => ({
            method: "POST",
            url: "/scans",
            payload: { not: "bytes" },
            headers: userAuth(ctx),
          }),
        },
      },
      {
        method: "GET",
        route: "/scans",
        expected: { anonymous: 401, user: 200, admin: 200 },
        request: {
          anonymous: () => ({ method: "GET", url: "/scans" }),
          user: () => ({
            method: "GET",
            url: "/scans",
            headers: userAuth(ctx),
          }),
          admin: () => ({
            method: "GET",
            url: "/scans",
            headers: adminAuth(ctx),
          }),
        },
      },
      {
        method: "GET",
        route: "/scans/{id}",
        expected: {
          anonymous: 401,
          user: 200,
          admin: 200,
          missingResource: 404,
        },
        request: {
          anonymous: () => ({
            method: "GET",
            url: `/scans/${(ctx as { existingScanId?: string }).existingScanId}`,
          }),
          user: () => ({
            method: "GET",
            url: `/scans/${(ctx as { existingScanId?: string }).existingScanId}`,
            headers: userAuth(ctx),
          }),
          admin: () => ({
            method: "GET",
            url: `/scans/${(ctx as { existingScanId?: string }).existingScanId}`,
            headers: adminAuth(ctx),
          }),
          missingResource: () => ({
            method: "GET",
            url: `/scans/${ctx.missingId}`,
            headers: userAuth(ctx),
          }),
        },
      },
      {
        method: "POST",
        route: "/scans/{id}/cancel",
        expected: {
          anonymous: 401,
          user: 202,
          missingResource: 404,
          conflict: 409,
        },
        request: {
          anonymous: () => ({
            method: "POST",
            url: `/scans/${ctx.cancelId}/cancel`,
          }),
          user: () => ({
            method: "POST",
            url: `/scans/${ctx.cancelId}/cancel`,
            headers: userAuth(ctx),
          }),
          missingResource: () => ({
            method: "POST",
            url: `/scans/${ctx.missingId}/cancel`,
            headers: userAuth(ctx),
          }),
          conflict: () => ({
            method: "POST",
            url: `/scans/${(ctx as { cancelledId?: string }).cancelledId}/cancel`,
            headers: userAuth(ctx),
          }),
        },
      },
      {
        method: "DELETE",
        route: "/scans/{id}",
        expected: {
          anonymous: 401,
          user: 403,
          admin: 204,
          missingResource: 404,
        },
        request: {
          anonymous: () => ({
            method: "DELETE",
            url: `/scans/${ctx.deleteId}`,
          }),
          user: () => ({
            method: "DELETE",
            url: `/scans/${ctx.deleteId}`,
            headers: userAuth(ctx),
          }),
          admin: () => ({
            method: "DELETE",
            url: `/scans/${ctx.deleteId}`,
            headers: adminAuth(ctx),
          }),
          missingResource: () => ({
            method: "DELETE",
            url: `/scans/${ctx.missingId}`,
            headers: adminAuth(ctx),
          }),
        },
      },
      {
        method: "POST",
        route: "/newsletter/subscribe",
        expected: {
          anonymous: 201,
          user: 201,
          invalidPayload: 422,
          conflict: 409,
        },
        request: {
          anonymous: () => ({
            method: "POST",
            url: "/newsletter/subscribe",
            payload: { email: "matrix-subscribe@example.com" },
          }),
          user: () => ({
            method: "POST",
            url: "/newsletter/subscribe",
            payload: { email: "matrix-subscribe-user@example.com" },
            headers: userAuth(ctx),
          }),
          invalidPayload: () => ({
            method: "POST",
            url: "/newsletter/subscribe",
            payload: { email: "nope" },
          }),
          conflict: () => ({
            method: "POST",
            url: "/newsletter/subscribe",
            payload: { email: "matrix-news@example.com" },
          }),
        },
      },
    ];

    // O status é a fonte de verdade; aqui só garantimos que a matriz cobre
    // exatamente as rotas registradas.
    const declared = new Set(matrix.map((row) => `${row.method} ${row.route}`));
    const registered = new Set(
      ctx.server
        .table()
        .map((route) => `${route.method.toUpperCase()} ${route.path}`),
    );
    expect([...registered].sort()).toEqual([...declared].sort());
  });

  afterAll(async () => {
    await ctx.server.stop({ timeout: 1_000 });
    await handle.destroy();
  });

  test("every scenario in the matrix matches its status", async () => {
    for (const row of matrix) {
      for (const [scenario, expectedStatus] of Object.entries(row.expected)) {
        const build = row.request[scenario as Scenario];
        expect(build, `${row.method} ${row.route} ${scenario}`).toBeDefined();

        const response = await ctx.server.inject(build!());
        expect(
          response.statusCode,
          `${row.method} ${row.route} [${scenario}]`,
        ).toBe(expectedStatus);
      }
    }
  });

  test("201 creates expose Location and 204 deletes have an empty body", async () => {
    const upload = matrix.find(
      (row) => row.method === "POST" && row.route === "/scans",
    );
    const created = await ctx.server.inject(upload!.request.user!());
    expect(created.statusCode).toBe(201);
    expect(created.headers["location"]).toMatch(/^\/scans\//);

    const other = await scans.create({ kind: "feed" });
    const deleted = await ctx.server.inject({
      method: "DELETE",
      url: `/scans/${other.id}`,
      headers: adminAuth(ctx),
    });
    expect(deleted.statusCode).toBe(204);
    expect(deleted.payload).toBe("");
  });
});
