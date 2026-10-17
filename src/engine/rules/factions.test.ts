/**
 * Fase 9 — facções (GDD 12), alvo de tribo e regra do eliminado (GDD 13). Uma verificação por
 * habilidade de factions.json, mais a montagem (escolha + sorteio sem repetir pela seed).
 */
import { describe, expect, it } from 'vitest';
import { cardCostPoints } from '../../data/validate';
import { actionCost, checkAction } from '../legal';
import { applyAction } from '../reducer';
import { createGame } from '../setup';
import type { GameState, PlayerId } from '../state';
import {
  edit,
  giveCard,
  key,
  makeContext,
  passTurn,
  place,
  RICH,
  setResources,
  startedGame,
} from '../testing';
import { checkDiscard } from './cards';
import { bankPrices, structureYield } from './economy';
import { cardDefOf } from './permanents';
import { progress } from './victory';

const ctx = makeContext(3);
const ALL = ['revolutionaries', 'government', 'helix', 'vantage', 'pirates', 'natives'];
const game = (factions: string[], layers: object = {}) =>
  startedGame(ctx, { seed: 3, layers: { factions: true, ...layers }, factions });

describe('Montagem das facções (GDD 12)', () => {
  it('escolhidas ficam; livres sorteadas sem repetir e iguais para a mesma seed', () => {
    const a = createGame(ctx, { seed: 9, layers: { factions: true }, factions: ['pirates', null, null] });
    const b = createGame(ctx, { seed: 9, layers: { factions: true }, factions: ['pirates', null, null] });
    const f = a.players.map((p) => p.faction);
    expect(f[0]).toBe('pirates');
    expect(new Set(f).size).toBe(3);
    expect(f.every((x) => ALL.includes(x))).toBe(true);
    expect(b.players.map((p) => p.faction)).toEqual(f);
  });

  it('sem a camada, assento N = facção N; o sorteio não mexe no RNG da partida', () => {
    const off = createGame(ctx, { seed: 9 });
    expect(off.players.map((p) => p.faction)).toEqual(ALL.slice(0, 3));
    const on = createGame(ctx, { seed: 9, layers: { factions: true } });
    expect(on.rngState).toBe(off.rngState);
    expect(on.hexes).toEqual(off.hexes);
  });

  it('facção repetida na escolha é erro de setup', () => {
    expect(() =>
      createGame(ctx, { seed: 1, layers: { factions: true }, factions: ['helix', 'helix'] }),
    ).toThrow();
  });
});

describe('Habilidades (factions.json → ability.effectId)', () => {
  it('Levante: em último no progresso, +1 ação no início do turno', () => {
    const s = game(['revolutionaries', 'government', 'helix']);
    expect(s.actionsLeft).toBe(ctx.balance.turn.actionsPerTurn + 1);
    // Na frente de todos: sem bônus no próximo turno.
    let rich = edit(s, (x) => setResources(x, 0, { gold: 8, oil: 8 }));
    while (!(rich.activePlayer === 0 && rich.round === 2)) rich = passTurn(ctx, rich).state;
    expect(rich.actionsLeft).toBe(ctx.balance.turn.actionsPerTurn);
  });

  it('Protocolo: carta fora da faixa n1 é recusada; compra +1 carta por turno', () => {
    const s = game(['government', 'helix', 'pirates'], { cards: true });
    const pricey = ctx.data.cards.find(
      (c) =>
        c.timing === 'install' &&
        cardCostPoints(c.cost, ctx.balance.costPoints) > ctx.balance.tierBands.n1[1],
    );
    const card = edit(s, (x) => setResources(x, 0, RICH));
    const uid = giveCard(card, 0, pricey?.id ?? '');
    expect(
      checkAction(ctx, card, { type: 'installPermanent', player: 0, card: uid }),
      pricey?.id,
    ).toMatchObject({
      ok: false,
      reason: { key: 'protocolBand' },
    });
    let t = s;
    const events = [];
    while (!(t.activePlayer === 0 && t.round === 2)) {
      const r = passTurn(ctx, t);
      t = r.state;
      events.push(...r.events);
    }
    expect(
      events.some((e) => e.type === 'factionAbility' && e.ability === 'protocol' && e.player === 0),
    ).toBe(true);
  });

  it('Eficiência: Parque nível 1 produz como nível 2', () => {
    const s = game(['helix', 'vantage', 'pirates']);
    const forest = Object.entries(s.hexes).find(([, h]) => h.surface === 'forest')?.[0] as string;
    const x = edit(s, (y) => {
      place(y, forest, 'park', 0, 1);
      place(y, forest, 'park', 1, 1);
    });
    const hex = x.hexes[forest]!;
    const [mine, theirs] = hex.structures.slice(-2);
    const a = structureYield(ctx, hex, mine!, new Map(), x);
    const b = structureYield(ctx, hex, theirs!, new Map(), x);
    const lvl2 = ctx.structure('park').levels[1]?.yield ?? 0;
    expect(Object.values(a)[0]).toBe(lvl2);
    expect(Object.values(b)[0]).toBeLessThan(lvl2);
  });

  it('Aquisição: a banca vende pelo valor (spread 1)', () => {
    const s = game(['vantage', 'helix', 'pirates']);
    const v = ctx.resourceValue('iron');
    expect(bankPrices(ctx, s, 0, 'iron')).toEqual({ sell: v - 1, buy: v });
    expect(bankPrices(ctx, s, 1, 'iron')).toEqual({ sell: v - 1, buy: v + 1 });
  });

  it('Saque: Sabotagem sem o descarte do custo', () => {
    const s = game(['pirates', 'helix', 'vantage'], { cards: true });
    const x = edit(s, (y) => void giveCard(y, 0, 'demolition'));
    const uid = x.players[0]?.hand.at(-1) as number;
    const def = cardDefOf(ctx, x, uid);
    expect(def.cost.discard).toBeGreaterThan(0);
    expect(checkDiscard(ctx, x, 0, def, [], [uid])).toBeNull();
    expect(checkDiscard(ctx, x, 1, def, [], [uid])?.key).toBe('invalidDiscard');
  });

  it('Raízes: o primeiro Sondar do turno não gasta ação', () => {
    const s = game(['natives', 'helix', 'vantage']);
    const a = { type: 'survey' as const, player: 0, hex: key(0, 1, 0) };
    expect(actionCost(ctx, s, a)).toBe(0);
    const r = applyAction(ctx, s, a);
    expect(r.state.actionsLeft).toBe(s.actionsLeft);
    expect(actionCost(ctx, r.state, { ...a, hex: key(0, 0, 1) })).toBe(1);
  });

  it('sem a camada de facções nenhuma habilidade vale', () => {
    const s = startedGame(ctx, { seed: 3 });
    expect(s.actionsLeft).toBe(ctx.balance.turn.actionsPerTurn);
    expect(actionCost(ctx, s, { type: 'survey', player: 2, hex: key(2, 1, 0) })).toBe(1);
  });
});

describe('Alvo de tribo e eliminado (GDD 13)', () => {
  const LAYERS = { conflict: true } as const;
  const target = (s: GameState, p: PlayerId) => s.players[p]?.tribeTarget as PlayerId;

  it('alvos sorteados: ninguém tira a si mesmo, todos diferentes; só com o conflito', () => {
    const s = startedGame(ctx, { seed: 5, layers: LAYERS });
    const targets = s.players.map((p) => p.tribeTarget);
    expect(new Set(targets).size).toBe(3);
    targets.forEach((t, i) => expect(t).not.toBe(i));
    expect(startedGame(ctx, { seed: 5 }).players.every((p) => p.tribeTarget === null)).toBe(true);
  });

  /** Tropa de `by` na Vila do alvo, sem defensor; a Vila tem `lives`. */
  const siege = (s: GameState, by: PlayerId, victim: PlayerId, lives: number) =>
    edit(s, (x) => {
      const v = x.players[victim]!;
      v.villageLives = lives;
      const uid = x.nextUid++;
      x.hexes[v.villageHex as string]?.troops.push({ uid, type: 'line', level: 1, owner: by, arrived: uid });
    });

  /** Encerra fases (sem cartas) até a rodada acabar ou a partida terminar. */
  const toRoundEnd = (s: GameState) => {
    let t = s;
    const round = s.round;
    while (t.round === round && t.stage === 'playing')
      t = applyAction(ctx, t, { type: 'endPhase', player: t.activePlayer }).state;
    return t;
  };

  it('por mão própria: o último dano é do jogador → vence no fim da rodada', () => {
    const s = startedGame(ctx, { seed: 5, layers: LAYERS });
    const end = toRoundEnd(siege(s, 0, target(s, 0), 2));
    expect(end.stage).toBe('over');
    expect(end.winners).toEqual([0]);
    expect(progress(ctx, end, 0).met).toContain('tribe');
  });

  it('dano de outro jogador não conta; alvo eliminado = trilha impossível', () => {
    const s = startedGame(ctx, { seed: 5, layers: LAYERS });
    const victim = target(s, 0);
    const other = [0, 1, 2].find((p) => p !== 0 && p !== victim) as PlayerId;
    const end = toRoundEnd(siege(s, other, victim, 2));
    expect(progress(ctx, end, 0).met).not.toContain('tribe');
    const gone = edit(s, (x) => void (x.players[victim]!.eliminated = true));
    expect(progress(ctx, gone, 0).tracks.tribe).toBe(0);
  });

  it('regra "neutra": o eliminado segue jogando pela IA, mas não vence', () => {
    const s = startedGame(ctx, { seed: 5, layers: LAYERS, eliminatedRule: 'neutral' });
    const end = toRoundEnd(siege(s, 2, 1, 1));
    expect(end.players[1]).toMatchObject({ eliminated: true, neutral: true });
    let t = end;
    const seen = new Set<number>();
    while (t.round === end.round && t.stage === 'playing') {
      seen.add(t.activePlayer);
      t = applyAction(ctx, t, { type: 'endPhase', player: t.activePlayer }).state;
    }
    expect(seen.has(1)).toBe(true);
    const leave = toRoundEnd(siege(startedGame(ctx, { seed: 5, layers: LAYERS }), 2, 1, 1));
    expect(leave.players[1]).toMatchObject({ eliminated: true, neutral: false });
  });
});
