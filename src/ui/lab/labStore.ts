/**
 * Estado do Laboratório (UX_SPEC 2.18): rascunho do balance.json (só na memória e no
 * navegador, nunca no arquivo), configuração do lote e o resultado da última simulação.
 */
import { create } from 'zustand';
import type { AiLevel } from '../../ai';
import { RAW_DATA } from '../../data';
import type { LayerName } from '../../engine';
import type { GameRecord } from '../../sim/game';
import { summarize, type SimSummary } from '../../sim/report';
import { DEFAULT_SIM, deckCardIds, seedsOf, simData, type SimConfig, splitSeeds } from '../../sim/run';
import type { SimWorkerIn, SimWorkerOut } from '../../sim/worker';

const STORAGE = 'p3077.lab.balance';
export const DEFAULT_BALANCE: unknown = RAW_DATA['balance.json'];

export type Path = readonly (string | number)[];

function loadDraft(): unknown {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) return JSON.parse(raw) as unknown;
  } catch {
    // Sem armazenamento (janela privada): começa do arquivo.
  }
  return structuredClone(DEFAULT_BALANCE);
}

function saveDraft(draft: unknown): void {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(draft));
  } catch {
    // Conveniência só: sem armazenamento, o rascunho vale até fechar a aba.
  }
}

/** Erros de validação do rascunho (vazio = válido). */
export function draftErrors(draft: unknown): string[] {
  try {
    simData(draft);
    return [];
  } catch (e) {
    return (e instanceof Error ? e.message : String(e)).split('\n').slice(1);
  }
}

export function getAt(obj: unknown, path: Path): unknown {
  let cur = obj;
  for (const k of path) cur = (cur as Record<string | number, unknown> | null)?.[k];
  return cur;
}

function setAt(obj: unknown, path: Path, value: unknown): unknown {
  const [head, ...rest] = path;
  if (head === undefined) return value;
  const copy = (Array.isArray(obj) ? [...obj] : { ...(obj as object) }) as Record<string | number, unknown>;
  copy[head] = setAt(copy[head], rest, value);
  return copy;
}

export interface RunState {
  readonly total: number;
  readonly done: number;
  readonly startedAt: number;
  readonly finishedAt: number | null;
}

interface LabStore {
  draft: unknown;
  config: Omit<SimConfig, 'balance'>;
  run: RunState | null;
  records: GameRecord[];
  summary: SimSummary | null;
  error: string | null;
  setValue(path: Path, value: unknown): void;
  restore(): void;
  setConfig(patch: Partial<Omit<SimConfig, 'balance'>>): void;
  setLayer(layer: LayerName, on: boolean): void;
  start(): void;
  stop(): void;
}

let workers: Worker[] = [];

export const useLab = create<LabStore>()((set, get) => ({
  draft: loadDraft(),
  config: { ...DEFAULT_SIM },
  run: null,
  records: [],
  summary: null,
  error: null,

  setValue: (path, value) => {
    const draft = setAt(get().draft, path, value);
    saveDraft(draft);
    set({ draft });
  },

  restore: () => {
    const draft = structuredClone(DEFAULT_BALANCE);
    saveDraft(draft);
    set({ draft });
  },

  setConfig: (patch) => set({ config: { ...get().config, ...patch } }),

  setLayer: (layer, on) =>
    set({ config: { ...get().config, layers: { ...get().config.layers, [layer]: on } } }),

  start: () => {
    get().stop();
    const { draft, config } = get();
    const errors = draftErrors(draft);
    if (errors.length) {
      set({ error: errors.join('\n') });
      return;
    }
    const full: SimConfig = { ...config, balance: draft };
    const cores = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
    const slices = splitSeeds(seedsOf(full), Math.min(cores, full.games));
    const records: GameRecord[] = [];
    let finished = 0;
    const cards = deckCardIds(simData(draft), full.layers);
    set({
      run: { total: full.games, done: 0, startedAt: performance.now(), finishedAt: null },
      records: [],
      summary: null,
      error: null,
    });
    workers = slices.map((seeds) => {
      const w = new Worker(new URL('../../sim/worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<SimWorkerOut>) => {
        const m = e.data;
        if (m.type === 'game') {
          records.push(m.record);
          const run = get().run;
          if (run) set({ run: { ...run, done: records.length } });
        } else if (m.type === 'error') {
          get().stop();
          set({ error: m.message });
        } else if (++finished === slices.length) {
          const sorted = [...records].sort((a, b) => a.seed - b.seed);
          const run = get().run;
          set({
            records: sorted,
            summary: summarize(sorted, cards),
            run: run ? { ...run, finishedAt: performance.now() } : null,
          });
          workers.forEach((x) => x.terminate());
          workers = [];
        }
      };
      w.postMessage({ config: full, seeds } satisfies SimWorkerIn);
      return w;
    });
  },

  stop: () => {
    workers.forEach((w) => w.terminate());
    workers = [];
    const run = get().run;
    if (run && run.finishedAt === null) set({ run: null });
  },
}));

export const LEVEL_OPTIONS: readonly AiLevel[] = ['easy', 'normal', 'hard'];
