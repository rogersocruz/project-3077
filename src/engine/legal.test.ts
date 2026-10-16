import { describe, expect, it } from 'vitest';
import { actionAt, actionTargets, checkAction } from './legal';
import { deficit } from './queries';
import { createGame } from './setup';
import { edit, key, makeContext, place, RICH, setResources, setTerrain, startedGame } from './testing';

const ctx = makeContext(3);
const base = startedGame(ctx);

describe('Alvos de ação para o destaque no mapa (legal.ts, CLAUDE.md regra 5)', () => {
  it('Explorar: os ocultos do próprio tabuleiro vizinhos de um revelado (GDD 6.3)', () => {
    const targets = actionTargets(ctx, base, 0, { type: 'explore' });
    for (const k of targets) {
      expect(base.hexes[k]?.boardId).toBe(0);
      expect(base.hexes[k]?.revealed).toBe(false);
    }
    // Vila no centro revela o anel 1 (GDD 3.3): os alvos são o anel 2 inteiro.
    expect(targets).toHaveLength(12);
  });

  it('Construir: só onde checkAction aceita, e nada quando falta recurso', () => {
    const s = edit(base, (d) => {
      setResources(d, 0, RICH);
      setTerrain(d, key(0, 1, 0), 'forest');
    });
    const parks = actionTargets(ctx, s, 0, { type: 'build', structure: 'park' });
    expect(parks).toContain(key(0, 1, 0));
    for (const k of parks) {
      expect(checkAction(ctx, s, { type: 'build', player: 0, structure: 'park', hex: k }).ok).toBe(true);
    }
    const poor = edit(s, (d) => setResources(d, 0, {}));
    expect(actionTargets(ctx, poor, 0, { type: 'build', structure: 'park' })).toEqual([]);
  });

  it('Melhorar: hexes com estrutura própria melhorável; actionAt escolhe qual', () => {
    const s = edit(base, (d) => {
      setResources(d, 0, RICH);
      setTerrain(d, key(0, 1, 0), 'forest');
      place(d, key(0, 1, 0), 'park', 0, 1);
      place(d, key(0, 0, 1), 'workshop', 0, 1);
    });
    const targets = actionTargets(ctx, s, 0, { type: 'upgrade' });
    expect(targets).toEqual(expect.arrayContaining([key(0, 0, 0), key(0, 1, 0), key(0, 0, 1)]));
    expect(actionAt(ctx, s, 0, { type: 'upgrade' }, key(0, 1, 0))).toMatchObject({ type: 'upgrade' });
    expect(actionAt(ctx, s, 0, { type: 'upgrade' }, key(0, -1, 0))).toBeNull();
  });

  it('Vila no setup: só a zona central do próprio tabuleiro (GDD 3.2 passo 7)', () => {
    const s = createGame(ctx, { seed: 1 });
    const targets = actionTargets(ctx, s, 0, { type: 'chooseVillage' });
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.length).toBeLessThanOrEqual(7);
    for (const k of targets) expect(s.hexes[k]?.boardId).toBe(0);
  });
});

describe('Déficit de custo (UX_SPEC 7.3: "Falta 1 Ferro")', () => {
  it('lista só o que falta', () => {
    const have = { food: 1, stone: 0, iron: 2, coal: 0, oil: 0, gold: 3 };
    expect(deficit(have, { stone: 2, iron: 3, gold: 1 })).toEqual({ stone: 2, iron: 1 });
    expect(deficit(have, { iron: 2 })).toEqual({});
  });
});
