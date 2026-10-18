/**
 * Parâmetros da partida na URL: `?view=game&players=3&seed=1&long=0&cards=1` e os assentos
 * (Fase 5): `seats=human,normal,hard` (um por jogador; falta = humano) ou `ai=all|easy|
 * normal|hard` (todos IA: modo espectador; `all` = Normal). Para capturas
 * reproduzíveis e testes, `speed=0.5|1|2|instant`, `privacy=0|1`, `quality`, `post`,
 * `adaptive`. Os de apresentação gravam nas configurações.
 */
import { type AiLevel, isAiLevel } from '../../ai/types';
import type { AnimationSpeed, Quality } from '../../settings';

/** Quem joga no assento: pessoa (hotseat) ou IA de um nível. */
export type SeatKind = 'human' | AiLevel;

export interface GameSetup {
  readonly players: number;
  readonly seed: number;
  readonly longMap: boolean;
  /** Camada de cartas (Fase 4; padrão ligada, `cards=0` desliga). */
  readonly cards: boolean;
  /** Eventos globais e hexes especiais (Fase 6; na URL `events=1`, `special=1`). */
  readonly events: boolean;
  readonly specialHexes: boolean;
  /** Tropas e combate (Fase 7; na URL `conflict=1`). */
  readonly conflict: boolean;
  /** Tratados (Fase 8; na URL `treaties=1`). */
  readonly treaties: boolean;
  /** Facções assimétricas (Fase 9; na URL `factions=1`, `fac=pirates,random,…`, `elim=neutral`). */
  readonly factions: boolean;
  /** Facção escolhida por assento; null = aleatória. */
  readonly factionPicks: readonly (string | null)[];
  /** GDD 13.2 / D11: regra do eliminado (null = padrão do balance.json). */
  readonly eliminatedRule: 'leave' | 'neutral' | null;
  /**
   * Regras desta partida (UX_SPEC 2.3 Vitória/Avançado): viram uma sobreposição do
   * balance.json só desta partida, gravada no save. Ausente = regras dos dados.
   */
  readonly rules?: GameRules;
  /** Um por jogador (Fase 5). */
  readonly seats: readonly SeatKind[];
}

/** UX_SPEC 2.3: ajustes de regra por partida. */
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

/** Regras da partida na URL: `apt` ações por turno, `rl` limite de rodadas, `off` trilhas. */
function rulesFromUrl(p: URLSearchParams): { rules?: GameRules } {
  const apt = Number(p.get('apt'));
  const rl = Number(p.get('rl'));
  const off = (p.get('off') ?? '').split(',').filter((x) => x !== '');
  const rules: { actionsPerTurn?: number; roundLimit?: number; disabledTracks?: string[] } = {};
  if (Number.isInteger(apt) && apt >= 1) rules.actionsPerTurn = apt;
  if (Number.isInteger(rl) && rl >= 1) rules.roundLimit = rl;
  if (off.length) rules.disabledTracks = off;
  return Object.keys(rules).length ? { rules } : {};
}

export function parseSeats(players: number, seats: string | null, ai: string | null): SeatKind[] {
  if (ai !== null) {
    const level: AiLevel = ai === 'all' || !isAiLevel(ai) ? 'normal' : ai;
    return Array.from({ length: players }, () => level);
  }
  const list = (seats ?? '').split(',');
  return Array.from({ length: players }, (_, i) => {
    const v = list[i]?.trim();
    return isAiLevel(v) ? v : 'human';
  });
}

export const isSpectator = (seats: readonly SeatKind[]) => seats.every((k) => k !== 'human');

export interface GameParams {
  readonly setup: GameSetup;
  readonly speed: AnimationSpeed | null;
  readonly privacy: boolean | null;
  readonly quality: Quality | null;
  /** Fase 10: abrir um save (`load=auto|1…10`) em vez de começar pela URL. */
  readonly load: 'auto' | number | null;
  readonly post: boolean | null;
  readonly adaptive: boolean | null;
}

const flag = (v: string | null): boolean | null => (v === null ? null : v !== '0');

export function parseGameParams(search: string): GameParams {
  const p = new URLSearchParams(search);
  const rawPlayers = Number(p.get('players') ?? 3);
  const players = Number.isInteger(rawPlayers) && rawPlayers >= 3 && rawPlayers <= 6 ? rawPlayers : 3;
  const seed = Number(p.get('seed') ?? 1);
  const speed = p.get('speed');
  const q = p.get('quality');
  return {
    setup: {
      players,
      seed: Number.isInteger(seed) && seed >= 0 ? seed : 1,
      longMap: p.get('long') === '1',
      cards: p.get('cards') !== '0',
      events: p.get('events') === '1',
      specialHexes: p.get('special') === '1',
      conflict: p.get('conflict') === '1',
      treaties: p.get('treaties') === '1',
      factions: p.get('factions') === '1',
      factionPicks: (p.get('fac') ?? '')
        .split(',')
        .filter((x) => x !== '')
        .map((x) => (x === 'random' ? null : x)),
      eliminatedRule: p.get('elim') === 'neutral' ? 'neutral' : p.get('elim') === 'leave' ? 'leave' : null,
      ...rulesFromUrl(p),
      seats: parseSeats(players, p.get('seats'), p.get('ai')),
    },
    speed:
      speed === 'instant' ? 'instant' : speed === '0.5' ? 0.5 : speed === '1' ? 1 : speed === '2' ? 2 : null,
    privacy: flag(p.get('privacy')),
    quality: q === 'low' || q === 'medium' || q === 'high' || q === 'ultra' ? q : null,
    load: (() => {
      const l = p.get('load');
      if (l === 'auto') return 'auto' as const;
      const n = Number(l);
      return l !== null && Number.isInteger(n) && n >= 1 ? n : null;
    })(),
    post: flag(p.get('post')),
    adaptive: flag(p.get('adaptive')),
  };
}

export const sameSetup = (a: GameSetup | null, b: GameSetup) =>
  !!a &&
  a.players === b.players &&
  a.seed === b.seed &&
  a.longMap === b.longMap &&
  a.cards === b.cards &&
  a.events === b.events &&
  a.specialHexes === b.specialHexes &&
  a.conflict === b.conflict &&
  a.treaties === b.treaties &&
  a.factions === b.factions &&
  a.factionPicks.join() === b.factionPicks.join() &&
  a.eliminatedRule === b.eliminatedRule &&
  JSON.stringify(a.rules ?? null) === JSON.stringify(b.rules ?? null) &&
  a.seats.join() === b.seats.join();
