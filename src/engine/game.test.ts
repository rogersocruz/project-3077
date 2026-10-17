import { describe, expect, it } from 'vitest';
import { RESOURCE_IDS } from '../data/schemas';
import ptBR from '../i18n/pt-BR.json';
import en from '../i18n/en.json';
import type { Action } from './actions';
import type { EngineContext } from './context';
import { decider, legalActions } from './legal';
import { ownedStructures, slotsUsed } from './queries';
import { REASON_KEYS } from './reasons';
import { applyAction, replay } from './reducer';
import { outpostLimit } from './rules/build';
import { Rng } from './rng';
import { createGame, type GameOptions } from './setup';
import { DRAW_DECKS, type GameState } from './state';
import { makeContext } from './testing';

/** Agente aleatório: sorteia um tipo de ação legal e depois uma ação desse tipo. */
function randomAction(ctx: EngineContext, state: GameState, rng: Rng): Action {
  const legal = legalActions(ctx, state, decider(state));
  if (legal.length === 0) throw new Error('nenhuma ação legal');
  const types = [...new Set(legal.map((a) => a.type))];
  const type = rng.pick(types);
  return rng.pick(legal.filter((a) => a.type === type));
}

/** Invariantes que valem em qualquer estado da Camada 0. */
function assertValid(ctx: EngineContext, s: GameState): void {
  for (const p of s.players) {
    for (const id of RESOURCE_IDS) {
      expect(
        Number.isInteger(p.resources[id]) && p.resources[id] >= 0,
        `recurso ${id} do jogador ${p.id}`,
      ).toBe(true);
    }
    expect(ownedStructures(s, p.id, 'outpost').length).toBeLessThanOrEqual(outpostLimit(ctx, s, p.id));
    expect(ownedStructures(s, p.id, 'village')).toHaveLength(s.stage === 'setup' && !p.villageHex ? 0 : 1);
  }
  for (const [key, hex] of Object.entries(s.hexes)) {
    expect(slotsUsed(ctx, hex), `espaços em ${key}`).toBeLessThanOrEqual(ctx.balance.hex.slots);
    const types = hex.structures.map((st) => st.type);
    expect(new Set(types).size, `tipo repetido em ${key}`).toBe(types.length);
    for (const st of hex.structures) {
      expect(st.level).toBeGreaterThanOrEqual(1);
      expect(st.level).toBeLessThanOrEqual(ctx.structure(st.type).levels.length);
      if (st.type === 'mine') {
        expect(st.tokens).toBeGreaterThan(0);
        expect(hex.surveyedBy).toContain(st.owner);
      }
      expect(hex.revealed || st.type === 'mine').toBe(true);
    }
  }
  expect(s.actionsLeft).toBeGreaterThanOrEqual(0);
  expect(s.round).toBeLessThanOrEqual(ctx.balance.turn.roundLimit);
  // Cartas: cada instância em exatamente um lugar; slots fixos; teto de recebimento.
  const places: number[] = [...s.cards.removed, ...s.cards.treasure, ...s.cards.treasureDiscard];
  for (const d of DRAW_DECKS) places.push(...s.cards.decks[d], ...s.cards.discards[d]);
  for (const p of s.players) {
    places.push(...p.hand, ...p.incoming.map((i) => i.card));
    for (const c of p.permanents) if (c !== null) places.push(c);
    expect(p.permanents).toHaveLength(ctx.balance.permanents.slots);
    expect(p.receivedThisRound).toBeLessThanOrEqual(ctx.balance.cards.receiveCapPerRound);
  }
  expect(places.sort((a, b) => a - b)).toEqual(s.cards.defs.map((_, i) => i));
}

function playRandomGame(ctx: EngineContext, options: GameOptions, agentSeed: number) {
  const rng = Rng.fromSeed(agentSeed);
  let state = createGame(ctx, options);
  let steps = 0;
  while (state.stage !== 'over') {
    state = applyAction(ctx, state, randomAction(ctx, state, rng)).state;
    assertValid(ctx, state);
    if (++steps > 20_000) throw new Error('partida não terminou');
  }
  return { state, steps };
}

// Partidas inteiras levam alguns segundos; em paralelo com o resto passam dos 5 s padrão.
describe('Partida completa da Camada 0 (critério de aceite da Fase 1)', { timeout: 60_000 }, () => {
  const ctx = makeContext(3);

  it('3 jogadores com ações legais aleatórias até vitória ou limite de rodadas, sem estado inválido', () => {
    const { state } = playRandomGame(ctx, { seed: 3077 }, 42);
    expect(state.stage).toBe('over');
    expect(state.winners.length).toBeGreaterThan(0);
    expect(state.endReason).not.toBeNull();
  });

  it('várias seeds, com hexes especiais ligados (inertes nesta fase)', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const { state } = playRandomGame(ctx, { seed, layers: { specialHexes: true } }, seed * 7);
      expect(state.stage).toBe('over');
    }
  });

  it.each([4, 5, 6])('%i jogadores também terminam', (n) => {
    const { state } = playRandomGame(makeContext(n), { seed: n }, n);
    expect(state.stage).toBe('over');
  });
});

describe(
  'Partida completa com Economia + Cartas (critério de aceite da Fase 4)',
  { timeout: 120_000 },
  () => {
    const ctx = makeContext(3);

    it('ações legais aleatórias (jogar, instalar, entregar, descartar) até o fim, sem estado inválido', () => {
      const { state } = playRandomGame(ctx, { seed: 4077, layers: { cards: true } }, 7);
      expect(state.stage).toBe('over');
      const kinds = new Set(state.log.map((a) => a.type));
      for (const k of ['playCard', 'installPermanent', 'deliverCard'] as const)
        expect(kinds.has(k), k).toBe(true);
    });

    it('com hexes especiais também (compensação pode comprar n2)', () => {
      const { state } = playRandomGame(ctx, { seed: 12, layers: { cards: true, specialHexes: true } }, 3);
      expect(state.stage).toBe('over');
    });

    it('determinismo com cartas: seed + log recriam o estado', () => {
      const options: GameOptions = { seed: 'cartas', layers: { cards: true } };
      const a = playRandomGame(ctx, options, 5).state;
      expect(replay(ctx, options, a.log)).toEqual(a);
    });
  },
);

describe('Determinismo (CLAUDE.md, regra de arquitetura 1)', { timeout: 60_000 }, () => {
  it('mesma seed + mesmo log produzem estados idênticos', () => {
    const ctx = makeContext(3);
    const options: GameOptions = { seed: 'determinismo', layers: { specialHexes: true } };
    const a = playRandomGame(ctx, options, 99).state;
    const b = playRandomGame(ctx, options, 99).state;
    expect(b).toEqual(a);
    // O salvamento é seed + log: repetir o log recria exatamente o mesmo estado.
    expect(replay(ctx, options, a.log)).toEqual(a);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });
});

describe('Motivos de ação ilegal têm texto (UX: "por que não posso")', () => {
  it.each([
    ['pt-BR', ptBR],
    ['en', en],
  ])('%s cobre todos os REASON_KEYS', (_, dict) => {
    const illegal = (dict as { engine?: { illegal?: Record<string, string> } }).engine?.illegal ?? {};
    for (const k of REASON_KEYS) expect(illegal[k], k).toBeTruthy();
  });
});
