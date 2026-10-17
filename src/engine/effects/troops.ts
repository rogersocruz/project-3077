/**
 * Cartas de tropa (Fase 7): Reforço Orbital, Deserção, Varredura Térmica, Retirada
 * Estratégica e os passivos Liga Cerâmica e Propulsão Antigrav (lidos por rules/troops.ts).
 */
import { z } from 'zod';
import { hexKeyOf } from '../queries';
import { retreat } from '../rules/combat';
import { findTroop } from '../rules/troops';
import type { HexKey } from '../state';
import { checkOrigin, radiusArea, rangeOrigins } from './targets';
import { defineEffect, type EffectScope, subjectOf } from './types';

const Count = z.number().int().positive();
const requires = ['conflict'] as const;

/** Tropas do jogador que sofre o efeito (as próprias ou as do destinatário). */
const subjectTroops = (s: EffectScope) =>
  Object.values(s.state.hexes).flatMap((h) =>
    h.troops.filter((t) => t.owner === subjectOf(s)).map((t) => ({ kind: 'troop' as const, uid: t.uid })),
  );

const checkSubjectTroop = (s: EffectScope, uid: number) => {
  const where = findTroop(s.state, uid);
  return where && where.troop.owner === subjectOf(s) ? null : { key: 'invalidTarget' as const };
};

/** Reforço Orbital: +força à tropa alvo até o fim da rodada. */
export const troopStrengthBonus = defineEffect({
  params: z.strictObject({ amount: Count }),
  target: 'troop',
  requires: [...requires],
  candidates: subjectTroops,
  check: (s, _p, t) => checkSubjectTroop(s, t.uid),
  apply: (s, p, t) => {
    const where = findTroop(s.state, t.uid);
    if (!where) return;
    const prev = where.troop.bonusRound === s.state.round ? (where.troop.bonusAmount ?? 0) : 0;
    where.troop.bonusRound = s.state.round;
    where.troop.bonusAmount = prev + p.amount;
    s.events.push({ type: 'troopBoosted', player: where.troop.owner, uid: t.uid, amount: p.amount });
  },
});

/** Deserção (entregue): a tropa alvo não se move na rodada (o turno do alvo). */
export const troopRoot = defineEffect({
  params: z.strictObject({}),
  target: 'troop',
  requires: [...requires],
  candidates: subjectTroops,
  check: (s, _p, t) => checkSubjectTroop(s, t.uid),
  apply: (s, _p, t) => {
    const where = findTroop(s.state, t.uid);
    if (!where) return;
    where.troop.rootedRound = s.state.round;
    s.events.push({ type: 'troopRooted', player: where.troop.owner, uid: t.uid });
  },
});

/** Varredura Térmica: relatório das tropas em RAIO N a partir da Vila ou de um Posto. */
export const revealTroops = defineEffect({
  params: z.strictObject({ radius: Count }),
  target: 'hex',
  requires: [...requires],
  candidates: (s) => rangeOrigins(s.ctx, s.state, s.player).map((hex) => ({ kind: 'hex' as const, hex })),
  check: (s, _p, t) => checkOrigin(s, t.hex),
  apply: (s, p, t) => {
    const origin = s.state.hexes[t.hex];
    if (!origin) return;
    const area = radiusArea(s.ctx, s.state, s.player, origin, p.radius);
    const structures = area.flatMap((hex) =>
      (s.state.hexes[hex]?.troops ?? []).map((tr) => ({
        hex,
        uid: tr.uid,
        type: tr.type,
        level: tr.level,
        owner: tr.owner,
      })),
    );
    s.events.push({
      type: 'intel',
      player: s.player,
      card: s.card,
      report: { kind: 'structures', target: null, origin: t.hex, structures },
    });
  },
});

/** Retirada Estratégica: tropas próprias num hex vizinho a inimigo vão para um vizinho seguro, sem Comida. */
export const freeRetreat = defineEffect({
  params: z.strictObject({}),
  target: 'hex',
  requires: [...requires],
  candidates: (s) =>
    Object.entries(s.state.hexes)
      .filter(([, h]) => h.troops.some((t) => t.owner === s.player))
      .map(([hex]) => ({ kind: 'hex' as const, hex: hex as HexKey })),
  check: (s, _p, t) => {
    const hex = s.state.hexes[t.hex];
    if (!hex || !hex.troops.some((tr) => tr.owner === s.player)) return { key: 'invalidTarget' };
    const threatened = s.ctx.planet
      .neighbors(hex)
      .some((n) => s.state.hexes[hexKeyOf(n)]?.troops.some((tr) => tr.owner !== s.player));
    return threatened ? null : { key: 'invalidTarget' };
  },
  apply: (s, _p, t) => retreat(s.ctx, s.state, t.hex, s.player, s.events),
});

/** Liga Cerâmica: Linhas +1 (passivo). */
export const lineStrengthBonus = defineEffect({
  params: z.strictObject({}),
  target: 'none',
  requires: [...requires],
});
/** Propulsão Antigrav: sem custo extra de Montanha e metade da Comida (passivo). */
export const antigrav = defineEffect({ params: z.strictObject({}), target: 'none', requires: [...requires] });
