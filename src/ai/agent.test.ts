/**
 * IA heurística (PROMPTS Fase 5): só ações legais, partidas inteiras nos três níveis,
 * determinismo pela seed, sem espiar o que está escondido e sem entregar vitória em troca.
 */
import { describe, expect, it } from 'vitest';
import { checkAction, decider } from '../engine/legal';
import { applyAction } from '../engine/reducer';
import { cardsGame, edit, key, makeContext, setResources, startedGame } from '../engine/testing';
import { playSimGame } from '../sim/game';
import { chooseAction, createAgent } from './agent';
import { evaluate, evaluateParts, projectedFocus } from './evaluate';
import { AI_LEVELS, DEFAULT_WEIGHTS } from './weights';

describe('Agente: partidas inteiras (GDD 6, 7 e 13)', { timeout: 120_000 }, () => {
  const ctx = makeContext(3);

  it.each(AI_LEVELS)('nível %s joga uma partida com cartas até o fim, só com ações legais', (level) => {
    // playSimGame aplica pelo reducer, que lança se a ação for ilegal.
    const r = playSimGame(ctx, { seed: 77, levels: [level], style: 'balanced' });
    expect(r.endReason).not.toBeNull();
    expect(r.winners.length).toBeGreaterThan(0);
    expect(r.rounds).toBeLessThanOrEqual(ctx.balance.turn.roundLimit);
  });

  it('níveis misturados e rotas sorteadas também terminam', () => {
    const r = playSimGame(ctx, { seed: 5, levels: ['easy', 'normal', 'hard'], style: 'mixed' });
    expect(r.seats.map((s) => s.level)).toEqual(['easy', 'normal', 'hard']);
    expect(r.seats.every((s) => s.focus !== null)).toBe(true);
  });

  it('determinismo: mesma seed, mesma partida (CLAUDE.md regra 1)', () => {
    const a = playSimGame(ctx, { seed: 12, levels: ['normal'] });
    const b = playSimGame(ctx, { seed: 12, levels: ['normal'] });
    expect({ ...b, ms: 0 }).toEqual({ ...a, ms: 0 });
  });
});

describe('Agente: decisões pontuais', () => {
  const ctx = makeContext(3);

  it('a ação escolhida passa em checkAction em várias situações', () => {
    let s = cardsGame(ctx, { seed: 3 });
    const agents = [0, 1, 2].map((i) => createAgent('normal', i));
    for (let i = 0; i < 60 && s.stage !== 'over'; i++) {
      const a = chooseAction(ctx, s, agents[decider(s)]!);
      expect(checkAction(ctx, s, a).ok).toBe(true);
      s = applyAction(ctx, s, a).state;
    }
  });

  it('não espia: tiles ocultos diferentes não mudam a escolha (GDD 3.3 névoa)', () => {
    const base = startedGame(ctx, { seed: 9 });
    const hidden = Object.entries(base.hexes)
      .filter(([, h]) => h.boardId === 0 && !h.revealed)
      .map(([k]) => k);
    expect(hidden.length).toBeGreaterThan(3);
    const variant = (surface: string, subsoil: string) =>
      edit(base, (x) => {
        for (const k of hidden) {
          x.hexes[k]!.surface = surface;
          x.hexes[k]!.subsoil = subsoil;
        }
      });
    const rich = variant('vein_gold', 'sub_gold');
    const poor = variant('empty', 'sub_empty');
    const pick = (s: typeof base) => chooseAction(ctx, s, createAgent('normal', 'peek'));
    expect(pick(rich)).toEqual(pick(poor));
    expect(evaluate(ctx, rich, 0, DEFAULT_WEIGHTS)).toBeCloseTo(evaluate(ctx, poor, 0, DEFAULT_WEIGHTS), 9);
  });

  it('não aceita troca que dá condição de vitória ao proponente (GDD 13.1)', () => {
    const coal = ctx.balance.victory.resourceThresholds.coal;
    let s = edit(startedGame(ctx, { seed: 4 }), (x) => {
      setResources(x, 0, { coal: coal - 1, food: 5 });
      setResources(x, 1, { coal: 5, food: 0 });
    });
    // Proposta generosa para o jogador 1 (5 Comida por 1 Carvão), mas dá a vitória ao 0.
    s = applyAction(ctx, s, {
      type: 'proposeTrade',
      player: 0,
      to: 1,
      give: { food: 5 },
      receive: { coal: 1 },
    }).state;
    expect(decider(s)).toBe(1);
    expect(chooseAction(ctx, s, createAgent('normal', 1)).type).toBe('rejectTrade');
  });

  it('aceita troca que melhora a própria posição sem dar a vitória', () => {
    let s = edit(startedGame(ctx, { seed: 4 }), (x) => {
      setResources(x, 0, { gold: 3, food: 1 });
      setResources(x, 1, { food: 6 });
    });
    s = applyAction(ctx, s, {
      type: 'proposeTrade',
      player: 0,
      to: 1,
      give: { gold: 2 },
      receive: { food: 1 },
    }).state;
    expect(chooseAction(ctx, s, createAgent('normal', 1)).type).toBe('acceptTrade');
  });

  it('valor de estrutura de extração entra na avaliação (renda futura)', () => {
    const s = startedGame(ctx, { seed: 2 });
    const before = evaluateParts(ctx, s, 0, DEFAULT_WEIGHTS);
    const withPark = edit(s, (x) => {
      const hex = x.hexes[key(0, 1, 0)]!;
      hex.surface = 'forest';
      hex.revealed = true;
      hex.structures.push({ uid: x.nextUid++, type: 'park', level: 1, owner: 0 });
    });
    expect(evaluateParts(ctx, withPark, 0, DEFAULT_WEIGHTS).income).toBeGreaterThan(before.income);
  });

  it('rota projetada segue o estoque e a renda', () => {
    const s = edit(startedGame(ctx, { seed: 2 }), (x) => setResources(x, 0, { gold: 9 }));
    expect(projectedFocus(ctx, s, 0, DEFAULT_WEIGHTS.horizon)).toBe('gold');
  });
});
