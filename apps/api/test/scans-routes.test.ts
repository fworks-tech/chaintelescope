/**
 * @fileoverview Rotas de scans contra PostgreSQL real: upload streamado,
 * paginação keyset, 404, cancelamento e 204 sem corpo.
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
import { AuthRepo } from "../src/db/repos/auth.js";
import { migrate } from "../src/db/migrate.js";
import { ScansRepo } from "../src/db/repos/scans.js";
import { signAccessToken } from "../src/auth/tokens.js";
import { makeDb } from "./helpers/db.js";

const DATABASE_URL = process.env.DATABASE_URL;
process.env["DATABASE_URL"] ??= DATABASE_URL;
process.env["ARGON2_PEPPER"] ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const JWT_SECRET =
  process.env["JWT_ACCESS_SECRET"] ?? "test-only-access-secret-0123456789abcdef";
process.env["JWT_ACCESS_SECRET"] = JWT_SECRET;

const { buildServer } = await import("../src/server.js");

interface ScanBody {
  id: string;
  status: string;
  kind: string;
  contentHash: string | null;
  createdAt: string;
  finishedAt: string | null;
}

describe.skipIf(!DATABASE_URL)("scan routes", () => {
  const handle = makeDb(DATABASE_URL ?? "");
  const repo = new ScansRepo(handle.db);
  let server: Server;
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    await migrate(handle.pool, "up");
    const user = await new AuthRepo(handle.db).createUser({
      email: "scans@example.com",
      passwordHash: "unused",
    });
    userToken = signAccessToken(user!.id, ["user"], JWT_SECRET, "15m").token;
    adminToken = signAccessToken(
      user!.id,
      ["user", "admin"],
      JWT_SECRET,
      "15m",
    ).token;
    server = await buildServer(undefined, { rateLimit: { enabled: false } });
    await server.initialize();
  });

  const auth = (token = userToken) => ({
    authorization: `Bearer ${token}`,
  });

  beforeEach(async () => {
    await handle.pool.query(
      "TRUNCATE scans, scan_artifacts, scan_matches CASCADE",
    );
  });

  afterAll(async () => {
    await server.stop({ timeout: 1_000 });
    await handle.destroy();
  });

  async function upload(bytes: Buffer) {
    return server.inject({
      method: "POST",
      url: "/scans",
      payload: bytes,
      headers: {
        "content-type": "application/octet-stream",
        ...auth(),
      },
    });
  }

  test("a 16 MiB upload is hashed without buffering in the handler", async () => {
    const route = server
      .table()
      .find((entry) => entry.method === "post" && entry.path === "/scans");

    expect(route?.settings.payload.output).toBe("stream");
    expect(route?.settings.payload.parse).toBe(false);

    const bytes = Buffer.alloc(16 * 1024 * 1024, 0x5a);
    const sha = createHash("sha256").update(bytes).digest("hex");

    const created = await upload(bytes);
    expect(created.statusCode).toBe(201);
    const body = created.result as ScanBody;
    expect(body.status).toBe("completed");
    expect(body.contentHash).toBe(sha);
    expect(created.headers["location"]).toBe(`/scans/${body.id}`);

    const fetched = await server.inject({
      method: "GET",
      url: created.headers["location"] as string,
      headers: auth(),
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.result).toMatchObject({
      id: body.id,
      kind: "upload",
      status: "completed",
      contentHash: sha,
    });

    const { rows } = await handle.pool.query<{ bytes: string }>(
      "SELECT bytes FROM scan_artifacts WHERE scan_id = $1",
      [body.id],
    );
    expect(Number(rows[0]?.bytes)).toBe(bytes.byteLength);
  });

  test("delete returns 204 with a zero-length body, then 404", async () => {
    const created = await upload(Buffer.from("small payload"));
    const id = (created.result as ScanBody).id;

    const deleted = await server.inject({
      method: "DELETE",
      url: `/scans/${id}`,
      headers: auth(adminToken),
    });
    expect(deleted.statusCode).toBe(204);
    expect(deleted.payload).toBe("");

    const missing = await server.inject({
      method: "GET",
      url: `/scans/${id}`,
      headers: auth(),
    });
    expect(missing.statusCode).toBe(404);
    expect((missing.result as { error: { code: string } }).error.code).toBe(
      "scan_not_found",
    );
  });

  test("an invalid id is 404 scan_not_found, not a database error", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/scans/nope",
      headers: auth(),
    });

    expect(response.statusCode).toBe(404);
    expect((response.result as { error: { code: string } }).error.code).toBe(
      "scan_not_found",
    );
  });

  test("cancelling a pending scan is 202 and seals it as cancelled", async () => {
    const scan = await repo.create({ kind: "feed" });

    const accepted = await server.inject({
      method: "POST",
      url: `/scans/${scan.id}/cancel`,
      headers: auth(),
    });
    expect(accepted.statusCode).toBe(202);

    const fetched = await server.inject({
      method: "GET",
      url: `/scans/${scan.id}`,
      headers: auth(),
    });
    const body = fetched.result as ScanBody;
    expect(body.status).toBe("cancelled");
    expect(body.finishedAt).not.toBeNull();

    const again = await server.inject({
      method: "POST",
      url: `/scans/${scan.id}/cancel`,
      headers: auth(),
    });
    expect(again.statusCode).toBe(409);
    expect((again.result as { error: { code: string } }).error.code).toBe(
      "scan_not_cancellable",
    );
  });

  test("cursor pagination over 30 scans is disjoint, ordered and complete", async () => {
    for (let index = 0; index < 30; index += 1) {
      // Três scans por instante: o desempate por id é obrigatório.
      const createdAt = new Date(
        Date.UTC(2026, 0, 1, 0, Math.floor(index / 3)),
      );
      await handle.db
        .insertInto("scans")
        .values({
          kind: "feed",
          status: "completed",
          content_hash: `hash-${index}`,
          created_at: createdAt,
          finished_at: createdAt,
        })
        .execute();
    }

    const pages: ScanBody[][] = [];
    let cursor: string | null = null;

    do {
      const url =
        cursor === null
          ? "/scans?limit=10"
          : `/scans?limit=10&cursor=${encodeURIComponent(cursor)}`;
      const response = await server.inject({ url, headers: auth() });
      expect(response.statusCode).toBe(200);
      const body = response.result as {
        items: ScanBody[];
        nextCursor: string | null;
      };
      pages.push(body.items);
      cursor = body.nextCursor;
    } while (cursor !== null);

    const ids = pages.flat().map((scan) => scan.id);
    expect(pages).toHaveLength(3);
    expect(new Set(ids).size).toBe(30);

    for (const page of pages) {
      for (let index = 1; index < page.length; index += 1) {
        const previous = page[index - 1]!;
        const current = page[index]!;
        const ordered =
          previous.createdAt === current.createdAt
            ? previous.id > current.id
            : previous.createdAt > current.createdAt;
        expect(ordered).toBe(true);
      }
    }
  });

  test("the status filter is applied before pagination", async () => {
    await handle.db
      .insertInto("scans")
      .values([
        { kind: "feed", status: "pending" },
        {
          kind: "feed",
          status: "failed",
          failure_reason: "boom",
          finished_at: new Date(),
        },
      ])
      .execute();

    const response = await server.inject({
      url: "/scans?status=failed",
      headers: auth(),
    });
    const body = response.result as { items: ScanBody[] };

    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.status).toBe("failed");
  });

  test("a malformed cursor is 400 invalid_cursor", async () => {
    const invalid = await server.inject({
      url: "/scans?cursor=not-a-cursor",
      headers: auth(),
    });
    expect(invalid.statusCode).toBe(400);
    expect((invalid.result as { error: { code: string } }).error.code).toBe(
      "invalid_cursor",
    );

    const badId = Buffer.from(
      JSON.stringify({ createdAt: new Date().toISOString(), id: "nope" }),
      "utf8",
    ).toString("base64url");
    const response = await server.inject({
      url: `/scans?cursor=${badId}`,
      headers: auth(),
    });
    expect(response.statusCode).toBe(400);
  });
});
