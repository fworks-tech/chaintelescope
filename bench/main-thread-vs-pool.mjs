import { monitorEventLoopDelay } from 'node:perf_hooks';
import { TaskPool } from '../apps/api/dist/workers/pool.js';

async function runBenchmark() {
  console.log('=== Event Loop Lag Benchmark: Main Thread vs Worker Pool ===\n');

  // Gera payload sintético de ~20 MB de JSON
  const itemCount = 50_000;
  const items = Array.from({ length: itemCount }, (_, i) => ({
    id: `item-${i}`,
    title: `Security alert notification item #${i} with extended context description`,
    link: `https://intel.hasheyes.org/feed/alerts/${i}`,
    pubDate: new Date().toISOString(),
  }));
  const rawJson = JSON.stringify({ items });
  console.log(`Payload size: ${(Buffer.byteLength(rawJson) / (1024 * 1024)).toFixed(2)} MB`);

  // 1. Benchmark na Thread Principal
  const hMain = monitorEventLoopDelay({ resolution: 20 });
  hMain.enable();

  const t0 = performance.now();
  const parsedDirect = JSON.parse(rawJson);
  const mainDuration = performance.now() - t0;

  // Força uma micro-pausa para capturar o delay registrado
  await new Promise((r) => setTimeout(r, 100));
  hMain.disable();

  const mainP99 = (hMain.percentile(99) / 1e6).toFixed(2);
  console.log(`[Main Thread] Duration: ${mainDuration.toFixed(2)}ms | p99 Event Loop Delay: ${mainP99}ms`);

  // 2. Benchmark com Worker Pool
  const pool = new TaskPool({ size: 2 });
  const hPool = monitorEventLoopDelay({ resolution: 20 });
  hPool.enable();

  const t1 = performance.now();
  const poolResult = await pool.run('parse-feed', { rawJson });
  const poolDuration = performance.now() - t1;

  await new Promise((r) => setTimeout(r, 100));
  hPool.disable();

  const poolP99 = (hPool.percentile(99) / 1e6).toFixed(2);
  console.log(`[Worker Pool] Duration: ${poolDuration.toFixed(2)}ms | p99 Event Loop Delay: ${poolP99}ms`);

  await pool.destroy();

  console.log('\nConclusion:');
  console.log(`- Main Thread stalled the Event Loop for ~${mainP99}ms.`);
  console.log(`- Worker Pool kept the Event Loop lag at ~${poolP99}ms, preserving HTTP responsiveness.`);
}

runBenchmark().catch(console.error);