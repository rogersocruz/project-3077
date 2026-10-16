import { describe, expect, it } from 'vitest';
import { applyAction } from '../engine/reducer';
import { makeContext, startedGame } from '../engine/testing';
import { buildShowcase } from './dev/showcase';
import { type SceneHex, SEAT_FACTIONS, sceneModel, tokenColumns } from './model';
import { structureSlots, troopSlots } from './placement';

describe('modelo de cena', () => {
  it('espelha o estado do motor: hexes, revelação, estruturas e estoque', () => {
    const ctx = makeContext(4);
    const state = startedGame(ctx);
    const model = sceneModel(ctx, state);
    expect(model.hexes).toHaveLength(ctx.planet.hexes.length);
    for (const h of model.hexes) {
      const s = state.hexes[h.key];
      expect(h.revealed).toBe(s?.revealed);
      expect(h.terrain).toBe(s?.surface);
      expect(h.structures.map((x) => x.type)).toEqual(s?.structures.map((x) => x.type));
    }
    model.players.forEach((p, i) => {
      expect(p.resources).toEqual(state.players[i]?.resources);
      expect(p.permanents).toHaveLength(ctx.balance.permanents.slots);
      expect(p.faction).toBe(SEAT_FACTIONS[i]);
    });
  });

  it('subsolo só aparece para quem sondou (DECISOES_ABERTAS D10)', () => {
    const ctx = makeContext(3);
    const s = applyAction(ctx, startedGame(ctx), { type: 'survey', player: 0, hex: '0:0,0' }).state;
    const resource = ctx.subsoil(s.hexes['0:0,0']?.subsoil ?? '').resource;
    const mine = sceneModel(ctx, s, 0).hexes.find((h) => h.key === '0:0,0');
    const theirs = sceneModel(ctx, s, 1).hexes.find((h) => h.key === '0:0,0');
    expect(mine?.subsoil).toEqual({ resource, depleted: false });
    expect(theirs?.subsoil).toBeNull();
    expect(sceneModel(ctx, s).hexes.every((h) => h.subsoil === null)).toBe(true);
  });

  it('pilhas de tokens: colunas de até N, com teto visual', () => {
    expect(tokenColumns(0, 10, 3)).toEqual([]);
    expect(tokenColumns(7, 10, 3)).toEqual([7]);
    expect(tokenColumns(23, 10, 3)).toEqual([10, 10, 3]);
    expect(tokenColumns(99, 10, 3)).toEqual([10, 10, 10]);
  });

  it('vitrine é determinística e não mexe no estado do motor', () => {
    const a = buildShowcase(6, 1);
    const b = buildShowcase(6, 1);
    expect(a.model).toEqual(b.model);
    expect(a.state.stage).toBe('playing');
    // Tropas e permanentes só existem no modelo (o motor ainda não as tem).
    expect(a.model.hexes.some((h) => h.troops.length > 0)).toBe(true);
    expect(a.model.players[0]?.permanents.filter(Boolean)).toHaveLength(3);
    // O jogador 0 mostra todos os tipos de estrutura.
    const types = new Set(
      a.model.hexes.flatMap((h) => h.structures.filter((s) => s.owner === 0).map((s) => s.type)),
    );
    for (const s of a.ctx.data.structures) expect(types.has(s.id)).toBe(true);
  });
});

describe('posições dentro do hex', () => {
  it('uma estrutura fica no centro; a Vila fica no centro quando divide o hex', () => {
    expect(structureSlots(['park'])).toEqual([{ x: 0, z: 0, scale: 1 }]);
    const slots = structureSlots(['village', 'market', 'workshop']);
    expect(slots[0]).toMatchObject({ x: 0, z: 0 });
    for (const s of slots.slice(1)) expect(Math.hypot(s.x, s.z)).toBeGreaterThan(0.4);
  });

  it('estruturas não se sobrepõem e ficam dentro do hex', () => {
    for (const n of [2, 3]) {
      const slots = structureSlots(Array.from({ length: n }, (_, i) => `t${i}`));
      for (const s of slots) expect(Math.hypot(s.x, s.z) + 0.34 * s.scale).toBeLessThan(0.87);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const a = slots[i];
          const b = slots[j];
          if (!a || !b) continue;
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.34 * (a.scale + b.scale) * 0.9);
        }
      }
    }
  });

  it('tropa vai para a borda quando há estrutura no hex', () => {
    const base: Omit<SceneHex, 'structures' | 'troops'> = {
      key: '0:0,0',
      boardId: 0,
      q: 0,
      r: 0,
      world: { x: 0, z: 0 },
      terrain: 'empty',
      kind: 'surface',
      revealed: true,
      subsoil: null,
    };
    const troop = { id: 't', kind: 'line' as const, level: 1, owner: 0 };
    const [free] = troopSlots({ ...base, structures: [], troops: [troop] });
    const [busy] = troopSlots({
      ...base,
      structures: [{ uid: 1, type: 'park', level: 1, owner: 0 }],
      troops: [troop],
    });
    expect(Math.hypot(free?.x ?? 9, free?.z ?? 9)).toBeLessThan(0.1);
    expect(Math.hypot(busy?.x ?? 0, busy?.z ?? 0)).toBeGreaterThan(0.5);
  });
});
