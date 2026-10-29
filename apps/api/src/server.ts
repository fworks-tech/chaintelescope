import Hapi from "@hapi/hapi";
import type { Server } from "@hapi/hapi";
import { env } from "./env.js";
import { dbPlugin } from "./db/pool.js";
import { healthPlugin } from "./routes/health.js";

export type AppConfig = typeof env;

export async function buildServer(config?: AppConfig): Promise<Server> {
  const resolved = config ?? env;
  const server = Hapi.server({
    host: resolved.HOST,
    port: resolved.PORT,
    routes: {
      payload: {
        maxBytes: 50 * 1024 * 1024,
      },
    },
  });

  await server.register([dbPlugin, healthPlugin]);

  return server;
}
