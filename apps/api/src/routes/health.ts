import type { Plugin, Server } from "@hapi/hapi";

export const healthPlugin: Plugin<void> = {
  name: "health",
  version: "0.0.0",
  register(server: Server) {
    server.route({
      method: "GET",
      path: "/healthz",
      options: { tags: ["api"] },
      handler: () => ({ status: "ok" }),
    });
  },
};
