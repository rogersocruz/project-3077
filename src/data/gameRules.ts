/**
 * Regras por partida (UX_SPEC 2.3 Vitória/Avançado; Laboratório e simulador): viram uma
 * sobreposição do balance.json só daquela partida, no formato de --override. data/ não muda.
 */
import { RESOURCE_IDS } from './schemas';

/** Ajustes de regra por partida. */
export interface GameRules {
  readonly actionsPerTurn?: number;
  readonly roundLimit?: number;
  /** Condições de vitória desligadas (trilhas: recursos, 'expansion', 'tribe'). */
  readonly disabledTracks?: readonly string[];
}

/** Limiar que desliga uma trilha de acúmulo/expansão (inalcançável). */
const OFF = 9999;

/** Sobreposição de dados (formato de --override) para as regras da partida. */
export function rulesOverride(rules: GameRules | undefined): Record<string, unknown> | undefined {
  if (!rules) return undefined;
  const balance: Record<string, unknown> = {};
  const turn: Record<string, number> = {};
  if (rules.actionsPerTurn) turn['actionsPerTurn'] = rules.actionsPerTurn;
  if (rules.roundLimit) turn['roundLimit'] = rules.roundLimit;
  if (Object.keys(turn).length) balance['turn'] = turn;
  const off = rules.disabledTracks ?? [];
  if (off.length) {
    const victory: Record<string, unknown> = {};
    const thresholds = Object.fromEntries(
      off.filter((t) => t !== 'expansion' && t !== 'tribe').map((t) => [t, OFF]),
    );
    if (Object.keys(thresholds).length) victory['resourceThresholds'] = thresholds;
    if (off.includes('expansion')) victory['expansionHexes'] = OFF;
    if (off.includes('tribe')) victory['tribeTarget'] = { enabled: false };
    balance['victory'] = victory;
  }
  return Object.keys(balance).length ? { 'balance.json': balance } : undefined;
}

/** Condições de vitória que podem ser desligadas (eliminação e limite de rodadas ficam sempre). */
export const WINCONS = [...RESOURCE_IDS, 'expansion', 'tribe'] as const;
export type Wincon = (typeof WINCONS)[number];

/** Trilhas desligadas a partir das ligadas. */
export const disabledFrom = (enabled: readonly string[]): string[] => WINCONS.filter((w) => !enabled.includes(w));
