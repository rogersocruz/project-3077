import { describe, expect, it } from 'vitest';
import type { Action } from '../engine/actions';
import type { EngineContext } from '../engine/context';
import { actionTargets } from '../engine/legal';
import { applyAction } from '../engine/reducer';
import { createGame } from '../engine/setup';
import type { GameState } from '../engine/state';
import {
  edit,
  key,
  makeContext,
  place,
  RICH,
  setResources,
  setTerrain,
  startedGame,
} from '../engine/testing';
import { buildCues } from './cues';

const ctx = makeContext(3);

function cuesOf(c: EngineContext, s: GameState, a: Action) {
  const { state, events } = applyAction(c, s, a);
  return buildCues(c, { before: s, after: state, events });
}

describe('pistas de animação a partir dos eventos (UX_SPEC 6)', () => {
  it('fundar a Vila: o chão aparece em cascata e depois a Vila sobe', () => {
    const s = createGame(ctx, { seed: 1 });
    const cues = cuesOf(ctx, s, { type: 'chooseVillage', player: 0, hex: key(0, 0, 0) });
    expect(cues.map((c) => c.kind)).toEqual(['reveal', 'village']);
    const [reveal, village] = cues;
    expect(reveal?.kind === 'reveal' && reveal.items).toHaveLength(7);
    expect(village).toMatchObject({ kind: 'village', target: { hex: key(0, 0, 0), structure: 'village' } });
  });

  it('Explorar vira uma revelação; Construir leva o custo pago junto', () => {
    const s = edit(startedGame(ctx), (d) => {
      setResources(d, 0, RICH);
      setTerrain(d, key(0, 1, 0), 'forest');
    });
    const target = actionTargets(ctx, s, 0, { type: 'explore' })[0] ?? '';
    expect(cuesOf(ctx, s, { type: 'explore', player: 0, hex: target })).toEqual([
      { kind: 'reveal', items: [{ hex: target, terrain: s.hexes[target]?.surface, hazard: false }] },
    ]);
    const build = cuesOf(ctx, s, { type: 'build', player: 0, structure: 'park', hex: key(0, 1, 0) });
    expect(build).toEqual([
      {
        kind: 'build',
        player: 0,
        cost: { stone: 2 },
        target: expect.objectContaining({ hex: key(0, 1, 0), structure: 'park', level: 1, owner: 0 }),
      },
    ]);
  });

  it('Sondar: a varredura sai da origem de alcance mais próxima (a Vila)', () => {
    const s = startedGame(ctx);
    const [cue] = cuesOf(ctx, s, { type: 'survey', player: 0, hex: key(0, 1, 0) });
    expect(cue).toEqual({ kind: 'survey', player: 0, hex: key(0, 1, 0), origin: key(0, 0, 0) });
  });

  it('passar o turno: fases, turno do próximo e produção dele em uma pista de cascata', () => {
    const s = edit(startedGame(ctx), (d) => {
      setTerrain(d, key(1, 1, 0), 'lagoon');
      place(d, key(1, 1, 0), 'park', 1, 1);
      setTerrain(d, key(1, 0, 1), 'forest');
      place(d, key(1, 0, 1), 'park', 1, 1);
    });
    const cues = cuesOf(ctx, s, { type: 'endPhase', player: 0 });
    expect(cues.map((c) => (c.kind === 'phase' ? `phase:${c.phase}` : c.kind))).toEqual([
      'phase:combat',
      'phase:delivery',
      'turn',
      'phase:reveal',
      'phase:draw',
      'phase:production',
      'production',
      'phase:upkeep',
      'phase:actions',
    ]);
    const production = cues.find((c) => c.kind === 'production');
    // Lagoa dá Comida + Pedregulho; Floresta dá Comida: 3 itens na mesma cascata.
    expect(production?.kind === 'production' && production.items).toHaveLength(3);
  });

  it('Mina que esgota: a posição vem do estado de antes (ela já saiu do depois)', () => {
    const N = key(1, 1, 0);
    const s = edit(startedGame(ctx), (d) => {
      setResources(d, 1, { coal: 5 });
      setTerrain(d, N, 'empty', 'sub_iron');
      d.hexes[N]?.surveyedBy.push(1);
      place(d, N, 'mine', 1, 1, { tokens: 1 });
    });
    const cues = cuesOf(ctx, s, { type: 'endPhase', player: 0 });
    const production = cues.find((c) => c.kind === 'production');
    expect(production?.kind === 'production' && production.items.map((i) => i.kind)).toEqual([
      'produce',
      'depleted',
    ]);
    expect(cues.some((c) => c.kind === 'upkeep')).toBe(false);
  });

  it('banca e troca aceita viram transferências com as quantidades do motor', () => {
    const s = startedGame(ctx);
    expect(
      cuesOf(ctx, s, { type: 'bankTrade', player: 0, give: 'stone', amount: 4, receive: 'iron' }),
    ).toEqual([{ kind: 'bank', player: 0, give: 'stone', amount: 4, receive: 'iron', received: 1 }]);
    const offered = applyAction(ctx, s, {
      type: 'proposeTrade',
      player: 0,
      to: 1,
      give: { food: 2 },
      receive: { iron: 1 },
    }).state;
    expect(cuesOf(ctx, offered, { type: 'acceptTrade', player: 1 })).toEqual([
      { kind: 'trade', from: 0, to: 1, give: { food: 2 }, receive: { iron: 1 } },
    ]);
  });
});
