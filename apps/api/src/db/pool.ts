import type { Plugin, Server } from "@hapi/hapi";
import pg from "pg";
import { env } from "../env.js";

declare module "@hapi/hapi" {
  interface Server {
    db: pg.Pool;
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

    server.decorate("server", "db", pool);

    server.ext("onPreStop", async () => {
      await pool.end();
    });
  },
};
