/**
 * Executor de lotes de simulação em worker_threads (usado por `npm run sim` e pelos
 * experimentos). Cada worker roda uma fatia de seeds e devolve as partidas.
 */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { GameRecord } from '../src/sim/game';
import { configOverride, seedsOf, type SimConfig, simData, splitSeeds } from '../src/sim/run';

export const defaultWorkers = () => Math.max(1, availableParallelism() - 1);

export async function runBatch(
  config: SimConfig,
  workers = defaultWorkers(),
  onGame?: (done: number) => void,
): Promise<{ records: GameRecord[]; wallMs: number; workers: number }> {
  simData(config.balance, configOverride(config)); // falha cedo com dado inválido
  const slices = splitSeeds(seedsOf(config), Math.min(workers, config.games));
  const started = performance.now();
  const records: GameRecord[] = [];
  await Promise.all(
    slices.map(
      (seeds) =>
        new Promise<void>((ok, ko) => {
          const worker = new Worker(new URL('./sim-worker.ts', import.meta.url), {
            workerData: { config, seeds },
            execArgv: process.execArgv,
          });
          worker.on('message', (m: { type: 'game'; record: GameRecord } | { type: 'done' }) => {
            if (m.type === 'game') {
              records.push(m.record);
              onGame?.(records.length);
            } else ok();
          });
          worker.on('error', ko);
          worker.on('exit', (code) => (code === 0 ? ok() : ko(new Error(`worker saiu com código ${code}`))));
        }),
    ),
  );
  records.sort((a, b) => a.seed - b.seed);
  return { records, wallMs: performance.now() - started, workers: slices.length };
}
