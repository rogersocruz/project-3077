/**
 * Métricas detalhadas do simulador: coletadas numa partida de verdade, agregadas com IC, e a
 * seleção de condições de vitória (desligada = inalcançável e fora do sorteio de rota).
 */
import { describe, expect, it } from 'vitest';
import { createContext } from '../engine';
import { playSimGame } from './game';
import { economyCsv, metricsText, summarizeMetrics } from './metricsReport';
import { configOverride, DEFAULT_SIM, simData } from './run';

const layers = {
  cards: true,
  events: true,
  specialHexes: true,
  conflict: true,
  treaties: true,
  factions: true,
};

describe('Métricas detalhadas', () => {
  const ctx = createContext(simData(), 4);
  const games = [1, 2, 3].map((seed) => playSimGame(ctx, { seed, levels: ['normal'], layers }));

  it('cada partida traz ritmo, curvas por rodada, ações, construção e matrizes', () => {
    const m = games[0]?.metrics;
    expect(m).toBeDefined();
    expect(m?.rounds).toHaveLength(4);
    expect(m?.rounds[0]?.length).toBe(games[0]!.rounds);
    expect(Object.keys(m?.actions[0] ?? {})).toContain('build');
    expect(m?.builds.some((b) => (b.count['park'] ?? 0) > 0)).toBe(true);
    expect(m?.trades).toHaveLength(4);
    expect(m?.pace.leadChanges).toBeGreaterThanOrEqual(0);
  });

  it('agregado com IC, texto e CSV de economia', () => {
    const s = summarizeMetrics(games);
    expect(s?.games).toBe(3);
    expect(s?.curve[0]?.n).toBe(12);
    expect(s?.curve[0]?.stock.lo).toBeLessThanOrEqual(s?.curve[0]?.stock.value ?? 0);
    expect(Object.keys(s?.stockByFaction ?? {}).length).toBeGreaterThan(0);
    const text = metricsText(s!);
    expect(text).toContain('Ritmo');
    expect(text).toContain('quem atrapalhou quem');
    expect(economyCsv(s!).split('\n')[0]).toContain('stock_seat1');
  });
});

describe('Seleção de condições de vitória', () => {
  it('desligadas viram limiar inalcançável; a IA só sorteia rotas ligadas', () => {
    const config = { ...DEFAULT_SIM, players: 4, layers, wincons: ['coal', 'gold'] };
    const ctx = createContext(simData(undefined, configOverride(config)), 4);
    expect(ctx.balance.victory.resourceThresholds.food).toBeGreaterThan(1000);
    expect(ctx.balance.victory.resourceThresholds.coal).toBeLessThan(100);
    expect(ctx.balance.victory.expansionHexes).toBeGreaterThan(1000);
    expect(ctx.balance.victory.tribeTarget.enabled).toBe(false);
    const r = playSimGame(ctx, { seed: 5, levels: ['normal'], layers, foci: ['coal', 'gold'] });
    expect(r.seats.every((s) => s.focus === 'coal' || s.focus === 'gold')).toBe(true);
    for (const t of r.winTracks) expect(['coal', 'gold', 'elimination']).toContain(t);
  });

  it('sem seleção, nenhum override extra', () => {
    expect(configOverride({ ...DEFAULT_SIM })).toBeUndefined();
  });
});
