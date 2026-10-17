/** Worker do `npm run sim`: roda uma fatia de seeds e manda cada partida de volta. */
import { parentPort, workerData } from 'node:worker_threads';
import { runSeeds, simContext, type SimConfig } from '../src/sim/run';

const { config, seeds } = workerData as { config: SimConfig; seeds: number[] };
const ctx = simContext(config);
runSeeds(ctx, config, seeds, (record) => parentPort?.postMessage({ type: 'game', record }));
parentPort?.postMessage({ type: 'done' });
