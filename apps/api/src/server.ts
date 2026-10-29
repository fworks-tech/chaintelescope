import Hapi from "@hapi/hapi";
import type { Server } from "@hapi/hapi";
import { env } from "./env.js";
import { dbPlugin } from "./db/pool.js";

export type AppConfig = typeof env;

export async function buildServer(config: AppConfig = env): Promise<Server> {
  const server = Hapi.server({
    host: config.HOST,
    port: config.PORT,
    routes: {
      payload: {
        maxBytes: 50 * 1024 * 1024,
      },
    },
  });

  await server.register([dbPlugin]);

  server.route({
    method: "GET",
    path: "/healthz",
    handler: (_request, h) => {
      return h
        .response({ status: "ok", timestamp: new Date().toISOString() })
        .code(200);
    },
  });

  return server;
}
