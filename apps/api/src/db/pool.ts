import type { Plugin, Server } from "@hapi/hapi";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { env } from "../env.js";
import type { DB } from "./schema.js";

declare module "@hapi/hapi" {
  interface Server {
    db: Kysely<DB>;
  }
}

export const dbPlugin: Plugin<Record<string, never>> = {
  name: "db-pool",
  version: "1.0.0",
  register: async (server: Server) => {
    const pool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });

    server.decorate("server", "db", db);

    server.ext("onPreStop", async () => {
      await db.destroy();
    });
  },
};
