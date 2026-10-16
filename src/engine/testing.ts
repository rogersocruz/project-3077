/**
 * Utilitários de teste do motor. Constroem partidas prontas e permitem montar
 * situações editando a cópia do estado (que é só dado).
 */
import { loadGameData } from '../data';
import type { Action } from './actions';
import { createContext, type EngineContext } from './context';
import type { GameEvent } from './events';
import { legalActions } from './legal';
import { applyAction } from './reducer';
import { handLimit } from './rules/decks';
import { createGame, type GameOptions } from './setup';
import {
  type CardUid,
  DRAW_DECKS,
  type GameState,
  type HexKey,
  type PlayerId,
  type Resources,
  type StructureState,
} from './state';

export const key = (boardId: number, q: number, r: number): HexKey => `${boardId}:${q},${r}`;

export function makeContext(players = 3, longMap = false): EngineContext {
  return createContext(loadGameData(), players, longMap);
}

/** Aplica uma sequência de ações, acumulando eventos. */
export function run(
  ctx: EngineContext,
  state: GameState,
  actions: Action[],
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let s = state;
  for (const a of actions) {
    const r = applyAction(ctx, s, a);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

/**
 * Partida já no turno 1 do jogador 0, fase de Ações: cada um fundou a Vila no centro
 * do próprio tabuleiro. Compensação (se houver) escolhe a primeira opção válida.
 */
export function startedGame(ctx: EngineContext, options: Partial<GameOptions> = {}): GameState {
  let s = createGame(ctx, { seed: 1, ...options });
  while (s.stage === 'setup') {
    const p = s.activePlayer;
    const pl = s.players[p];
    if (pl?.compensation === 'pending') {
      const comp = legalActions(ctx, s, p).find((a) => a.type === 'chooseCompensation');
      if (!comp) throw new Error('sem compensação legal');
      s = applyAction(ctx, s, comp).state;
      continue;
    }
    const hex = key(p, 0, 0);
    // A Vila não pode ir em sítio/hazard: neste helper força terreno comum no centro.
    const h = s.hexes[hex];
    if (h && ctx.terrain(h.surface).kind !== 'surface') h.surface = 'empty';
    s = applyAction(ctx, s, { type: 'chooseVillage', player: p, hex }).state;
  }
  return s;
}

/** Edição direta (para montar cenários). Devolve a cópia editada. */
export function edit(state: GameState, fn: (s: GameState) => void): GameState {
  const s = structuredClone(state);
  fn(s);
  return s;
}

export function setResources(s: GameState, player: PlayerId, res: Partial<Resources>): void {
  const p = s.players[player];
  if (!p) throw new RangeError(`jogador ${player}`);
  p.resources = { food: 0, stone: 0, iron: 0, coal: 0, oil: 0, gold: 0, ...res };
}

export function place(
  s: GameState,
  hex: HexKey,
  type: string,
  owner: PlayerId,
  level = 1,
  extra: Partial<StructureState> = {},
): number {
  const h = s.hexes[hex];
  if (!h) throw new RangeError(`hex ${hex}`);
  const uid = s.nextUid++;
  h.structures.push({ uid, type, level, owner, ...extra });
  return uid;
}

export function setTerrain(
  s: GameState,
  hex: HexKey,
  surface: string,
  subsoil?: string,
  revealed = true,
): void {
  const h = s.hexes[hex];
  if (!h) throw new RangeError(`hex ${hex}`);
  h.surface = surface;
  if (subsoil !== undefined) h.subsoil = subsoil;
  h.revealed = revealed;
}

export const RICH: Partial<Resources> = { food: 50, stone: 50, iron: 50, coal: 50, oil: 50, gold: 50 };

// ── Cartas ───────────────────────────────────────────────────────────────────

/** Partida com a camada de cartas ligada, no turno 1 do jogador 0 (fase de Ações). */
export function cardsGame(ctx: EngineContext, options: Partial<GameOptions> = {}): GameState {
  return startedGame(ctx, { ...options, layers: { cards: true, ...options.layers } });
}

/**
 * Edição: põe na mão uma cópia da carta `id`, tirada do baralho ou do descarte; se a
 * carta está fora do baralho (camada desligada, Tesouro), cria uma instância nova.
 */
export function giveCard(s: GameState, player: PlayerId, id: string): CardUid {
  const c = s.cards;
  const p = s.players[player];
  if (!p) throw new RangeError(`jogador ${player}`);
  for (const deck of DRAW_DECKS) {
    for (const pile of [c.decks[deck], c.discards[deck]]) {
      const i = pile.findIndex((u) => c.defs[u] === id);
      if (i < 0) continue;
      const [uid] = pile.splice(i, 1);
      if (uid === undefined) break;
      p.hand.push(uid);
      return uid;
    }
  }
  const uid = c.defs.length;
  c.defs.push(id);
  p.hand.push(uid);
  return uid;
}

/** Edição: instala direto no primeiro slot livre (sem custo). */
export function installCard(s: GameState, player: PlayerId, id: string): CardUid {
  const uid = giveCard(s, player, id);
  const p = s.players[player];
  if (!p) throw new RangeError(`jogador ${player}`);
  p.hand.splice(p.hand.indexOf(uid), 1);
  const slot = p.permanents.indexOf(null);
  if (slot < 0) throw new Error('slots cheios');
  p.permanents[slot] = uid;
  return uid;
}

/**
 * Encerra o turno do jogador ativo (Ações → Entrega → próximo turno): descarta até o
 * limite se preciso e, se o próximo parar na Compra, escolhe a linha 0.
 */
export function passTurn(ctx: EngineContext, state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let s = state;
  const step = (a: Action) => {
    const r = applyAction(ctx, s, a);
    s = r.state;
    events.push(...r.events);
  };
  const player = s.activePlayer;
  if (s.phase === 'actions') step({ type: 'endPhase', player });
  if (s.phase === 'delivery' && s.activePlayer === player) {
    const p = s.players[player];
    const excess = (p?.hand.length ?? 0) - handLimit(ctx, s, player);
    if (p && excess > 0) step({ type: 'discardCards', player, cards: p.hand.slice(0, excess) });
    step({ type: 'endPhase', player });
  }
  while (s.stage === 'playing' && s.phase === 'draw')
    step({ type: 'chooseDraw', player: s.activePlayer, row: 0 });
  return { state: s, events };
}

/** Passa turnos até a fase de Ações do jogador indicado. */
export function untilTurnOf(
  ctx: EngineContext,
  state: GameState,
  player: PlayerId,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let s = state;
  do {
    const r = passTurn(ctx, s);
    s = r.state;
    events.push(...r.events);
  } while (s.activePlayer !== player && s.stage === 'playing');
  return { state: s, events };
}
