/**
 * Cartas de informação: Auditoria, Sondagem Profunda, Reconhecimento, Dossiê,
 * Vazamento de Mercado. O resultado é um relatório privado (evento `intel`) e, quando a
 * informação persiste (subsolo), marca o hex como sondado pelo jogador.
 */
import { z } from 'zod';
import type { IntelStructure } from '../events';
import type { HexKey, PlayerId } from '../state';
import { structureYield } from '../rules/economy';
import { boardHexKeys, boardOf, checkOrigin, otherPlayers, radiusArea, rangeOrigins } from './targets';
import { type ApplyScope, defineEffect, type EffectScope } from './types';

const Radius = z.strictObject({ radius: z.number().int().nonnegative() });

const originTargets = (s: EffectScope) =>
  rangeOrigins(s.ctx, s.state, s.player).map((hex) => ({ kind: 'hex' as const, hex }));

const otherPlayerTargets = (s: EffectScope) =>
  otherPlayers(s.state, s.player).map((player) => ({ kind: 'player' as const, player }));

const checkOtherPlayer = (s: EffectScope, player: PlayerId) =>
  player !== s.player && s.state.players[player] ? null : { key: 'invalidTarget' as const };

/** Mutável: o jogador passa a conhecer o subsolo do hex (D10: privado). */
function learnSubsoil(s: ApplyScope, key: HexKey): void {
  const hex = s.state.hexes[key];
  if (!hex || hex.surveyedBy.includes(s.player)) return;
  hex.surveyedBy.push(s.player);
  s.events.push({ type: 'subsoilSurveyed', hex: key, player: s.player, subsoil: hex.subsoil });
}

function structuresIn(s: ApplyScope, keys: readonly HexKey[], withYield: boolean): IntelStructure[] {
  const out: IntelStructure[] = [];
  for (const key of keys) {
    const hex = s.state.hexes[key];
    if (!hex) continue;
    for (const st of hex.structures) {
      const extraction = s.ctx.structure(st.type).subtype === 'extraction';
      out.push({
        hex: key,
        uid: st.uid,
        type: st.type,
        level: st.level,
        owner: st.owner,
        ...(withYield && extraction ? { produces: structureYield(s.ctx, hex, st) } : {}),
      });
    }
  }
  return out;
}

/**
 * Auditoria: nível e produção das estruturas na área. No digital, estrutura e nível já
 * são públicos; a informação nova é o recurso das Minas (subsolo privado, D10).
 */
export const revealStructures = defineEffect({
  params: Radius,
  target: 'hex',
  candidates: originTargets,
  check: (s, _p, t) => checkOrigin(s, t.hex),
  apply: (s, p, t) => {
    const origin = s.state.hexes[t.hex];
    if (!origin) return;
    const area = radiusArea(s.ctx, s.state, s.player, origin, p.radius);
    for (const key of area) {
      if (s.state.hexes[key]?.structures.some((st) => st.type === 'mine')) learnSubsoil(s, key);
    }
    s.events.push({
      type: 'intel',
      player: s.player,
      card: s.card,
      report: { kind: 'structures', target: null, origin: t.hex, structures: structuresIn(s, area, true) },
    });
  },
});

/** Sondagem Profunda: revela o subsolo de toda a área a partir da Vila ou de um Posto. */
export const revealSubsoilArea = defineEffect({
  params: Radius,
  target: 'hex',
  candidates: originTargets,
  check: (s, _p, t) => checkOrigin(s, t.hex),
  apply: (s, p, t) => {
    const origin = s.state.hexes[t.hex];
    if (!origin) return;
    for (const key of radiusArea(s.ctx, s.state, s.player, origin, p.radius)) learnSubsoil(s, key);
  },
});

/** Reconhecimento: estruturas (e, com conflito, tropas) do tabuleiro alvo. */
export const revealBoard = defineEffect({
  params: z.strictObject({}),
  target: 'player',
  candidates: otherPlayerTargets,
  check: (s, _p, t) => checkOtherPlayer(s, t.player),
  apply: (s, _p, t) => {
    const keys = boardHexKeys(s.ctx, boardOf(s.state, t.player));
    s.events.push({
      type: 'intel',
      player: s.player,
      card: s.card,
      report: {
        kind: 'structures',
        target: t.player,
        origin: null,
        structures: structuresIn(s, keys, false),
      },
    });
  },
});

/** Dossiê: veja a mão do alvo. */
export const revealHand = defineEffect({
  params: z.strictObject({}),
  target: 'player',
  candidates: otherPlayerTargets,
  check: (s, _p, t) => checkOtherPlayer(s, t.player),
  apply: (s, _p, t) => {
    const hand = s.state.players[t.player]?.hand ?? [];
    s.events.push({
      type: 'intel',
      player: s.player,
      card: s.card,
      report: { kind: 'hand', target: t.player, cards: [...hand] },
    });
  },
});

/** Vazamento de Mercado: estoque de todos (no digital o estoque já é público pelas trilhas). */
export const revealStocks = defineEffect({
  params: z.strictObject({}),
  target: 'none',
  apply: (s) => {
    s.events.push({
      type: 'intel',
      player: s.player,
      card: s.card,
      report: {
        kind: 'stocks',
        stocks: s.state.players.map((p) => ({ player: p.id, resources: { ...p.resources } })),
      },
    });
  },
});
