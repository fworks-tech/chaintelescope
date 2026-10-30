/**
 * @fileoverview Despachante interno de mensagens executado dentro de cada Worker Thread instanciada pelo pool.
 * @module api/workers/worker-runner
 */

import { parentPort } from "node:worker_threads";
import { parseFeedTask, type ParseFeedInput } from "./tasks/parse-feed.js";
import {
  matchBlocklistTask,
  type MatchBlocklistInput,
} from "./tasks/match-blocklist.js";

/**
 * Estrutura de dados recebida pela thread via protocolo de mensagens (postMessage).
 */
interface TaskPayload {
  readonly taskId: string;
  readonly name: string;
  readonly input: unknown;
}

parentPort?.on("message", async (message: TaskPayload) => {
  const { taskId, name, input } = message;

  try {
    let result: unknown;

    if (name === "parse-feed") {
      result = parseFeedTask(input as ParseFeedInput);
    } else if (name === "match-blocklist") {
      result = matchBlocklistTask(input as MatchBlocklistInput);
    } else if (name === "infinite-loop-task") {
      // Simula carga pesada de CPU-bound travando intencionalmente a thread secundária para teste de timeout
      const end = Date.now() + 60_000;
      while (Date.now() < end) {
        // Bloqueio intencional de CPU
      }
      result = null;
    } else {
      throw new Error(`Unknown task handler: ${name}`);
    }

    parentPort?.postMessage({ taskId, success: true, result });
  } catch (err) {
    parentPort?.postMessage({
      taskId,
      success: false,
      error: {
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
});
