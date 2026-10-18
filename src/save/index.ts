/**
 * Salvamento (UX_SPEC 9): o save é o log de ações + seed + versão das regras + o setup da
 * partida (camadas, assentos, facções, regras da partida). Carregar = refazer a partida pelo
 * log (o motor é determinístico); o `checksum` do estado confere que deu igual.
 * 10 espaços manuais + o automático, em localStorage; exportar/importar arquivo JSON.
 */
import { z } from 'zod';
import type { Action, GameState } from '../engine';

export type SlotId = 'auto' | number;
export const MANUAL_SLOTS = 10;
const KEY = (slot: SlotId) => `p3077.save.${slot}`;

export interface SaveSummary {
  readonly round: number;
  readonly stage: GameState['stage'];
  readonly factions: readonly string[];
  readonly activePlayer: number;
}

export interface SaveFile {
  readonly format: 'projeto-3077/save';
  readonly version: 1;
  readonly rulesVersion: string;
  readonly savedAt: number;
  /** GameSetup da interface (ui/game/params.ts). */
  readonly setup: Record<string, unknown>;
  readonly log: readonly Action[];
  /** Impressão do estado salvo: o carregamento confere a reconstrução. */
  readonly checksum: string;
  readonly summary: SaveSummary;
}

const SaveSchema = z.object({
  format: z.literal('projeto-3077/save'),
  version: z.literal(1),
  rulesVersion: z.string(),
  savedAt: z.number(),
  setup: z.record(z.string(), z.unknown()),
  log: z.array(z.record(z.string(), z.unknown())),
  checksum: z.string(),
  summary: z.object({
    round: z.number(),
    stage: z.enum(['setup', 'playing', 'over']),
    factions: z.array(z.string()),
    activePlayer: z.number(),
  }),
});

/** FNV-1a 32 bits do JSON do estado (sem o log, que já está no save). */
export function stateChecksum(state: GameState): string {
  const text = JSON.stringify({ ...state, log: state.log.length });
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function makeSave(state: GameState, setup: Record<string, unknown>, savedAt: number): SaveFile {
  return {
    format: 'projeto-3077/save',
    version: 1,
    rulesVersion: state.rulesVersion,
    savedAt,
    setup,
    log: state.log,
    checksum: stateChecksum(state),
    summary: {
      round: state.round,
      stage: state.stage,
      factions: state.players.map((p) => p.faction),
      activePlayer: state.activePlayer,
    },
  };
}

/** Lê e valida um save (texto JSON); null se inválido. */
export function parseSave(text: string): SaveFile | null {
  try {
    const r = SaveSchema.safeParse(JSON.parse(text));
    return r.success ? (r.data as unknown as SaveFile) : null;
  } catch {
    return null;
  }
}

const storage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export function writeSave(slot: SlotId, save: SaveFile): boolean {
  try {
    storage()?.setItem(KEY(slot), JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function readSave(slot: SlotId): SaveFile | null {
  const text = storage()?.getItem(KEY(slot));
  return text ? parseSave(text) : null;
}

export function deleteSave(slot: SlotId): void {
  storage()?.removeItem(KEY(slot));
}

/** Espaços na ordem da tela: automático, depois 1–10. */
export function listSaves(): { slot: SlotId; save: SaveFile | null }[] {
  const slots: SlotId[] = ['auto', ...Array.from({ length: MANUAL_SLOTS }, (_, i) => i + 1)];
  return slots.map((slot) => ({ slot, save: readSave(slot) }));
}

export const exportSave = (save: SaveFile): string => JSON.stringify(save, null, 2);
