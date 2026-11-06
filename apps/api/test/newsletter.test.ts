/**
 * @fileoverview Assinatura da newsletter contra PostgreSQL: defaults, 201,
 * 409 no e-mail repetido e 422 no e-mail inválido.
 */

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

interface SubscriptionBody {
  id: string;
  email: string;
  frequency: string;
  format: string;
  createdAt: string;
}

describe.skipIf(!DATABASE_URL)("newsletter routes", () => {
  const handle = makeDb(DATABASE_URL ?? "");
  let server: Server;

  beforeAll(async () => {
    await migrate(handle.pool, "up");
    server = await buildServer();
    await server.initialize();
  });

  beforeEach(async () => {
    await handle.pool.query("TRUNCATE newsletter_subscriptions");
  });

  afterAll(async () => {
    await server.stop({ timeout: 1_000 });
    await handle.destroy();
  });

  test("subscribes with defaults and normalises the e-mail", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/newsletter/subscribe",
      payload: { email: "  Reader@Example.COM " },
    });

    expect(response.statusCode).toBe(201);
    expect(response.result).toMatchObject({
      email: "reader@example.com",
      frequency: "Weekly",
      format: "Summary",
    });
    expect((response.result as SubscriptionBody).createdAt).toBeTypeOf(
      "string",
    );
  });

  test("keeps the requested frequency and format", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/newsletter/subscribe",
      payload: {
        email: "daily@example.com",
        frequency: "Daily",
        format: "Deep Dive",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.result).toMatchObject({
      frequency: "Daily",
      format: "Deep Dive",
    });
  });

  test("the unique e-mail index is 409 duplicate_subscription", async () => {
    const payload = { email: "twice@example.com" };

    expect(
      (
        await server.inject({
          method: "POST",
          url: "/newsletter/subscribe",
          payload,
        })
      ).statusCode,
    ).toBe(201);

    const duplicate = await server.inject({
      method: "POST",
      url: "/newsletter/subscribe",
      payload,
    });

    expect(duplicate.statusCode).toBe(409);
    expect((duplicate.result as { error: { code: string } }).error.code).toBe(
      "duplicate_subscription",
    );
  });

  test("an invalid e-mail or an unknown frequency is 422", async () => {
    const invalidEmail = await server.inject({
      method: "POST",
      url: "/newsletter/subscribe",
      payload: { email: "not-an-email" },
    });
    expect(invalidEmail.statusCode).toBe(422);
    expect(
      (invalidEmail.result as { details: Array<{ path: string }> }).details[0]
        ?.path,
    ).toBe("email");

    const invalidFrequency = await server.inject({
      method: "POST",
      url: "/newsletter/subscribe",
      payload: { email: "person@example.com", frequency: "Hourly" },
    });
    expect(invalidFrequency.statusCode).toBe(422);
    expect(
      (invalidFrequency.result as { details: Array<{ path: string }> })
        .details[0]?.path,
    ).toBe("frequency");
  });
});
