/**
 * @fileoverview Gerenciamento de pool de Worker Threads para isolamento de tarefas síncronas pesadas (CPU-bound).
 * @module api/workers/pool
 */

import { Worker } from "node:worker_threads";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Erro lançado quando uma tarefa ultrapassa o limite de tempo estipulado na fila ou na execução do worker.
 */
export class TaskTimeoutError extends Error {
  constructor(taskName: string, timeoutMs: number) {
    super(
      `Task "${taskName}" timed out after ${timeoutMs}ms and was terminated.`,
    );
    this.name = "TaskTimeoutError";
  }
}

/**
 * Parâmetros de dimensionamento e tempo de vida do pool de workers.
 */
export interface TaskPoolOptions {
  /** Número máximo de workers executando em paralelo (default: min(núcleos da máquina, 8)). */
  size?: number | undefined;
  /** Timeout padrão de execução por tarefa em milissegundos (default: 30.000ms). */
  taskTimeoutMs?: number | undefined;
}

/**
 * Representação interna de uma tarefa enfileirada no pool.
 */
interface QueuedTask<In, Out> {
  name: string;
  input: In;
  transferList?: readonly ArrayBuffer[] | undefined;
  signal?: AbortSignal | undefined;
  resolve: (value: Out | PromiseLike<Out>) => void;
  reject: (reason?: unknown) => void;
  timeoutMs: number;
}

/**
 * Estado operacional de um worker thread no pool.
 */
interface WorkerSlot {
  worker: Worker;
  busy: boolean;
  activeTimer?: NodeJS.Timeout | undefined;
}

/**
 * Pool de Worker Threads no modelo borrow-pool com capacidade finita.
 */
export class TaskPool<TName extends string, In, Out> {
  private readonly size: number;
  private readonly defaultTaskTimeoutMs: number;
  private readonly slots: WorkerSlot[] = [];
  private readonly queue: QueuedTask<In, Out>[] = [];
  private isDestroyed = false;

  constructor(opts: TaskPoolOptions = {}) {
    const defaultConcurrency = Math.min(os.cpus().length || 1, 8);
    this.size = opts.size ?? defaultConcurrency;
    this.defaultTaskTimeoutMs = opts.taskTimeoutMs ?? 30_000;

    for (let i = 0; i < this.size; i++) {
      this.slots.push(this.createSlot());
    }
  }

  private createSlot(): WorkerSlot {
    const candidates = [
      resolve(__dirname, "./worker-runner.js"),
      resolve(__dirname, "./worker-runner.mjs"),
      resolve(__dirname, "./worker-runner.ts"),
      resolve(process.cwd(), "apps/api/src/workers/worker-runner.ts"),
      resolve(process.cwd(), "src/workers/worker-runner.ts"),
    ];
    let worker: Worker | undefined;
    for (const c of candidates) {
      try {
        worker = new Worker(c);
        break;
      } catch {
        try {
          worker = new Worker(c, { execArgv: ["--loader", "ts-node/esm"] });
          break;
        } catch {
          // continue
        }
      }
    }
    if (!worker) {
      // last resort: use eval worker
      const workerScript = `
        import { parentPort } from 'node:worker_threads';
        import { parseFeedTask } from ${JSON.stringify(resolve(process.cwd(), "apps/api/src/workers/tasks/parse-feed.ts"))};
        import { matchBlocklistTask } from ${JSON.stringify(resolve(process.cwd(), "apps/api/src/workers/tasks/match-blocklist.ts"))};
        const registry = { 'parse-feed': parseFeedTask, 'match-blocklist': matchBlocklistTask, 'infinite-loop-task': async()=>{const end=Date.now()+60000;while(Date.now()<end){}return null;} };
        parentPort?.on('message', async (message)=>{
          const {taskId,name,input}=message;
          try {
            const h = registry[name];
            if(!h) throw new Error('Unknown task handler: '+name);
            const result = await h(input);
            parentPort?.postMessage({taskId,success:true,result});
          } catch(err){
            parentPort?.postMessage({taskId,success:false,error:{message:err instanceof Error?err.message:String(err)}});
          }
        });
      `;
      worker = new Worker(workerScript, { eval: true, execArgv: ["--input-type=module", "--loader", "ts-node/esm"] });
    }
    const slot: WorkerSlot = { worker, busy: false };
    worker.on("error", () => { this.recycleSlot(slot); });
    worker.on("exit", (code) => { if (code !== 0 && !this.isDestroyed) this.recycleSlot(slot); });
    return slot;
  }

  private recycleSlot(slot: WorkerSlot): void {
    if (slot.activeTimer) {
      clearTimeout(slot.activeTimer);
      slot.activeTimer = undefined;
    }

    try {
      void slot.worker.terminate();
    } catch {
      // ignore
    }

    const index = this.slots.indexOf(slot);
    if (index !== -1 && !this.isDestroyed) {
      const newSlot = this.createSlot();
      this.slots[index] = newSlot;
      this.dispatch();
    }
  }

  public run(
    name: TName,
    input: In,
    opts: {
      timeoutMs?: number | undefined;
      signal?: AbortSignal | undefined;
      transferList?: readonly ArrayBuffer[] | undefined;
    } = {},
  ): Promise<Out> {
    if (this.isDestroyed) {
      return Promise.reject(new Error("TaskPool has been destroyed"));
    }

    return new Promise<Out>((resolve, reject) => {
      const task: QueuedTask<In, Out> = {
        name,
        input,
        transferList: opts.transferList,
        signal: opts.signal,
        resolve,
        reject,
        timeoutMs: opts.timeoutMs ?? this.defaultTaskTimeoutMs,
      };

      this.queue.push(task);
      this.dispatch();
    });
  }

  private dispatch(): void {
    if (this.queue.length === 0) return;

    const availableSlot = this.slots.find((s) => !s.busy);
    if (!availableSlot) return;

    const task = this.queue.shift();
    if (!task) return;

    if (task.signal?.aborted) {
      task.reject(new Error("Task aborted by signal"));
      this.dispatch();
      return;
    }

    availableSlot.busy = true;
    const taskId = Math.random().toString(36).slice(2);

    const onAbort = () => {
      cleanup();
      availableSlot.busy = false;
      task.reject(new Error("Task aborted by signal"));
      this.recycleSlot(availableSlot);
    };

    const cleanup = () => {
      if (availableSlot.activeTimer) {
        clearTimeout(availableSlot.activeTimer);
        availableSlot.activeTimer = undefined;
      }
      if (task.signal) {
        task.signal.removeEventListener("abort", onAbort);
      }
    };

    if (task.signal) {
      task.signal.addEventListener("abort", onAbort, { once: true });
    }

    availableSlot.activeTimer = setTimeout(() => {
      cleanup();
      availableSlot.busy = false;
      task.reject(new TaskTimeoutError(task.name, task.timeoutMs));
      this.recycleSlot(availableSlot);
    }, task.timeoutMs);

    const onMessage = (response: {
      taskId: string;
      success: boolean;
      result?: Out;
      error?: { message: string };
    }) => {
      if (response.taskId !== taskId) return;

      availableSlot.worker.off("message", onMessage);
      cleanup();
      availableSlot.busy = false;

      if (response.success) {
        task.resolve(response.result as Out);
      } else {
        task.reject(
          new Error(response.error?.message ?? "Worker execution failed"),
        );
      }

      this.dispatch();
    };

    availableSlot.worker.on("message", onMessage);

    const transfer = task.transferList ? [...task.transferList] : [];
    availableSlot.worker.postMessage(
      { taskId, name: task.name, input: task.input },
      transfer,
    );
  }

  public async destroy(): Promise<void> {
    this.isDestroyed = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      task?.reject(new Error("Task cancelled due to pool shutdown"));
    }

    await Promise.all(
      this.slots.map(async (slot) => {
        if (slot.activeTimer) clearTimeout(slot.activeTimer);
        await slot.worker.terminate();
      }),
    );
    this.slots.length = 0;
  }
}
