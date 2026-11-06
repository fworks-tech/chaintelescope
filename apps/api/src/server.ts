import Hapi from "@hapi/hapi";
import type { Server } from "@hapi/hapi";
import HapiPino from "hapi-pino";
import { authPlugin } from "./auth/routes.js";
import { env } from "./env.js";
import { dbPlugin } from "./db/pool.js";
import { errorsPlugin } from "./plugins/errors.js";
import { failAction, validationPlugin } from "./plugins/validation.js";
import type { ScanRow } from "./db/schema.js";
import { healthPlugin } from "./routes/health.js";
import { newsletterPlugin } from "./routes/newsletter.js";
import { scansPlugin } from "./routes/scans.js";
import { ScanCanceller } from "./scans/cancellation.js";
import type { ScanDaemon } from "./scans/daemon.js";
import type { ScanSource } from "./scans/orchestrator.js";
import { scanDaemonPlugin } from "./scans/plugin.js";

declare module "@hapi/hapi" {
  interface ServerApplicationState {
    /** Compartilhado entre o daemon e (futuramente) a rota de cancelamento. */
    scanCanceller: ScanCanceller;
    scanDaemon?: ScanDaemon;
  }
}

export type AppConfig = typeof env;

export interface BuildServerOptions {
  /**
   * Resolve a origem dos bytes por scan. Sem ele o daemon não é registrado:
   * não há fetcher para `feed`/`snapshot` e reclamar scans só para falhá-los
   * seria pior do que não pollar.
   */
  readonly scanSourceFor?: (scan: ScanRow) => ScanSource | undefined;
}

export async function buildServer(
  config?: AppConfig,
  options: BuildServerOptions = {},
): Promise<Server> {
  const resolved = config ?? env;
  const server = Hapi.server({
    host: resolved.HOST,
    port: resolved.PORT,
    routes: {
      payload: {
        maxBytes: 50 * 1024 * 1024,
      },
      validate: { failAction },
    },
  });

  // O canceller é compartilhado entre o daemon e as rotas de cancelamento.
  const canceller = new ScanCanceller();
  server.app.scanCanceller = canceller;

  await server.register({
    plugin: HapiPino,
    options: {
      level: resolved.NODE_ENV === "test" ? "silent" : "info",
      // Tokens e cookies nunca entram no log, nem em nível debug.
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        'res.headers["set-cookie"]',
      ],
    },
  });

  await server.register([
    validationPlugin,
    dbPlugin,
    healthPlugin,
    scansPlugin,
    newsletterPlugin,
  ]);

  await server.register({
    plugin: authPlugin,
    options: {
      accessSecret: resolved.JWT_ACCESS_SECRET,
      accessTtl: resolved.JWT_ACCESS_TTL,
      refreshTtlDays: resolved.JWT_REFRESH_TTL_DAYS,
      pepper: resolved.ARGON2_PEPPER,
      secureCookie: resolved.NODE_ENV === "production",
    },
  });

  // Último: o envelope de erro envolve as respostas de todas as rotas.
  await server.register(errorsPlugin);

  if (resolved.SCAN_DAEMON_ENABLED && options.scanSourceFor !== undefined) {
    await server.register(
      scanDaemonPlugin({
        sourceFor: options.scanSourceFor,
        canceller,
        intervalMs: resolved.SCAN_POLL_INTERVAL_MS,
        concurrency: resolved.SCAN_CONCURRENCY,
      }),
    );
  }

  return server;
}
