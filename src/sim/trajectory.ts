/**
 * Trajetórias por rota perseguida (experimento 1): por rodada, a mediana do estoque do
 * recurso-alvo, da produção líquida (produzido − gasto) e do comprado na banca, entre os
 * assentos que perseguiam aquela rota e ainda estavam em jogo naquela rodada (n).
 * Expansão: alvo = hexes com estrutura; líquido = variação na rodada; banca = 0.
 */
import { AI_FOCI, type AiFocus } from '../ai/types';
import { RESOURCE_IDS } from '../data/schemas';
import type { GameRecord } from './game';
import { median } from './stats';

export interface TrajectoryRow {
  readonly round: number;
  /** Assentos com dado nesta rodada (partidas que ainda não tinham acabado). */
  readonly n: number;
  readonly stock: number;
  readonly net: number;
  readonly bought: number;
}

export type TrajectoryTable = Record<AiFocus, TrajectoryRow[]>;

export function trajectoryTable(records: readonly GameRecord[], maxRound = 15): TrajectoryTable {
  const out = {} as TrajectoryTable;
  for (const focus of AI_FOCI) {
    const idx = RESOURCE_IDS.indexOf(focus as (typeof RESOURCE_IDS)[number]);
    const rows: TrajectoryRow[] = [];
    for (let r = 1; r <= maxRound; r++) {
      const stock: number[] = [];
      const net: number[] = [];
      const bought: number[] = [];
      for (const g of records) {
        for (const s of g.seats) {
          if (s.focus !== focus) continue;
          const p = s.trajectory[r - 1];
          if (!p) continue;
          if (idx < 0) {
            stock.push(p.hexes);
            net.push(p.hexes - (s.trajectory[r - 2]?.hexes ?? 0));
            bought.push(0);
          } else {
            stock.push(p.stock[idx] ?? 0);
            net.push((p.produced[idx] ?? 0) - (p.spent[idx] ?? 0));
            bought.push(p.bought[idx] ?? 0);
          }
        }
      }
      rows.push({
        round: r,
        n: stock.length,
        stock: median(stock),
        net: median(net),
        bought: median(bought),
      });
    }
    out[focus] = rows;
  }
  return out;
}

/** Estoque mediano na rodada T de quem perseguia cada recurso (calibração de limiares). */
export function stockAtRound(
  records: readonly GameRecord[],
  round: number,
): Record<string, { median: number; n: number }> {
  const out: Record<string, { median: number; n: number }> = {};
  for (const focus of AI_FOCI) {
    const idx = RESOURCE_IDS.indexOf(focus as (typeof RESOURCE_IDS)[number]);
    const vals: number[] = [];
    for (const g of records) {
      for (const s of g.seats) {
        if (s.focus !== focus) continue;
        const p = s.trajectory[round - 1];
        if (!p) continue;
        vals.push(idx < 0 ? p.hexes : (p.stock[idx] ?? 0));
      }
    }
    out[focus] = { median: median(vals), n: vals.length };
  }
  return out;
}

const cell = (x: number) => (Number.isNaN(x) ? '—' : Number.isInteger(x) ? String(x) : x.toFixed(1));

/** Tabelas em Markdown (uma por rota). */
export function trajectoryMarkdown(t: TrajectoryTable, labels: Record<string, string>): string {
  const out: string[] = [];
  for (const focus of AI_FOCI) {
    const target = focus === 'expansion' ? 'hexes com estrutura' : (labels[focus] ?? focus);
    out.push(
      `#### ${labels[focus] ?? focus} (alvo: ${target})`,
      '',
      '| Rodada | n | Estoque | Líquido (prod − gasto) | Comprado na banca |',
      '|---|---|---|---|---|',
      ...t[focus].map(
        (r) => `| ${r.round} | ${r.n} | ${cell(r.stock)} | ${cell(r.net)} | ${cell(r.bought)} |`,
      ),
      '',
    );
  }
  return out.join('\n');
}

/** CSV: rota, rodada, n, estoque, líquido, comprado. */
export function trajectoryCsv(t: TrajectoryTable): string {
  const lines = ['focus,round,n,stock_median,net_median,bought_median'];
  for (const focus of AI_FOCI) {
    for (const r of t[focus])
      lines.push([focus, r.round, r.n, cell(r.stock), cell(r.net), cell(r.bought)].join(','));
  }
  return lines.join('\n') + '\n';
}
