import { loadEnv } from "./env.js";
import { buildServer } from "./server.js";

const env = loadEnv();

const server = await buildServer(env);

const shutdown = async (signal: string): Promise<void> => {
  server.log(
    ["info", "lifecycle"],
    `${signal} received. Draining in-flight connections...`,
  );
  try {
    await server.stop({ timeout: 10_000 });
    process.exit(0);
  } catch (err) {
    server.log(["error", "lifecycle"], `Error during shutdown: ${String(err)}`);
    process.exit(1);
  }
};

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

await server.start();
server.log(["info", "lifecycle"], `Hapi listening on ${server.info.uri}`);
