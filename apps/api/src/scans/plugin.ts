/**
 * @fileoverview Plugin Hapi do daemon de scans: boot, reconcile e shutdown.
 * @module api/scans/plugin
 */

import type { Plugin, Server } from "@hapi/hapi";
import { ScanArtifactsRepo } from "../db/repos/artifacts.js";
import { ScansRepo } from "../db/repos/scans.js";
import type { ScanRow } from "../db/schema.js";
import type { ScanCanceller } from "./cancellation.js";
import { ScanDaemon } from "./daemon.js";
import type { ScanSource } from "./orchestrator.js";

export interface ScanDaemonPluginOptions {
  readonly sourceFor: (scan: ScanRow) => ScanSource | undefined;
  readonly canceller: ScanCanceller;
  readonly intervalMs: number;
  readonly concurrency: number;
}

export function scanDaemonPlugin(
  options: ScanDaemonPluginOptions,
): Plugin<void> {
  return {
    name: "scan-daemon",
    version: "0.0.0",
    register(server: Server) {
      const daemon = new ScanDaemon({
        scans: new ScansRepo(server.db),
        artifacts: new ScanArtifactsRepo(server.db),
        canceller: options.canceller,
        sourceFor: options.sourceFor,
        intervalMs: options.intervalMs,
        concurrency: options.concurrency,
        onError: (error) => {
          server.log(
            ["error", "scan"],
            error instanceof Error ? error.message : String(error),
          );
        },
      });

      server.app.scanDaemon = daemon;
      server.ext("onPostStart", async () => {
        await daemon.start();
      });
      server.ext("onPreStop", async () => {
        await daemon.stop();
      });
    },
  };
}
