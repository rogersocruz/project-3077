/// <reference lib="webworker" />
/**
 * Web Worker do Laboratório: roda uma fatia de seeds e devolve cada partida. O mesmo
 * núcleo do `npm run sim` (src/sim/run.ts), sem renderização.
 */
import { runSeeds, simContext, type SimConfig } from './run';

export type SimWorkerIn = { readonly config: SimConfig; readonly seeds: readonly number[] };
export type SimWorkerOut =
  | { readonly type: 'game'; readonly record: import('./game').GameRecord }
  | { readonly type: 'done' }
  | { readonly type: 'error'; readonly message: string };

const post = (m: SimWorkerOut) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = (e: MessageEvent<SimWorkerIn>) => {
  try {
    const { config, seeds } = e.data;
    const ctx = simContext(config);
    runSeeds(ctx, config, seeds, (record) => post({ type: 'game', record }));
    post({ type: 'done' });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
