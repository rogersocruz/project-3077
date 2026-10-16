/**
 * Permanentes (GDD 7.4): Engenharia Reversa destrói, Espionagem Industrial rouba com
 * troca forçada, Contraespionagem impede roubo. Os passivos não têm `apply`: as regras
 * os leem por `effectId` (rules/permanents.ts → permanentsWith).
 */
import { z } from 'zod';
import { getPlayer } from '../queries';
import { autoSurveyAdjacent, freeSlot, hasPermanent, removePermanent, slotOf } from '../rules/permanents';
import type { CardTarget } from '../state';
import { defineEffect, type EffectScope, subjectOf } from './types';

const Count = z.number().int().positive();
const None = z.strictObject({});

const permanentTargets = (s: EffectScope): Extract<CardTarget, { kind: 'permanent' }>[] => {
  const owner = subjectOf(s);
  return getPlayer(s.state, owner)
    .permanents.filter((c) => c !== null)
    .map((card) => ({ kind: 'permanent' as const, player: owner, card }));
};

const checkInstalled = (s: EffectScope, t: Extract<CardTarget, { kind: 'permanent' }>) => {
  if (s.recipient === null || t.player !== s.recipient) return { key: 'invalidTarget' as const };
  return slotOf(s.state, t.player, t.card) >= 0 ? null : { key: 'notInstalled' as const };
};

/** Engenharia Reversa: destrói 1 permanente do alvo (sai do jogo). */
export const destroyPermanent = defineEffect({
  params: None,
  target: 'permanent',
  candidates: permanentTargets,
  check: (s, _p, t) => checkInstalled(s, t),
  apply: (s, _p, t) => {
    removePermanent(s.state, t.player, t.card, 'destroyed', s.events);
  },
});

/**
 * Espionagem Industrial (interpretação AF): rouba o permanente. Sem slot livre, o
 * remetente perde o permanente escolhido na entrega (ou o do primeiro slot, se aquele
 * não estiver mais lá). Contraespionagem do alvo anula o roubo.
 */
export const stealPermanent = defineEffect({
  params: None,
  target: 'permanent',
  candidates: permanentTargets,
  check: (s, _p, t) => {
    const reason = checkInstalled(s, t);
    if (reason) return reason;
    if (hasPermanent(s.ctx, s.state, t.player, 'immuneToSteal')) return { key: 'immuneToSteal' };
    if (s.stage === 'play' && freeSlot(s.state, s.player) < 0) {
      if (s.sacrifice === undefined || slotOf(s.state, s.player, s.sacrifice) < 0) {
        return { key: 'sacrificeRequired' };
      }
    }
    return null;
  },
  apply: (s, _p, t) => {
    const thief = getPlayer(s.state, s.player);
    removePermanent(s.state, t.player, t.card, 'stolen', s.events);
    let slot = freeSlot(s.state, s.player);
    if (slot < 0) {
      const chosen = s.sacrifice !== undefined && slotOf(s.state, s.player, s.sacrifice) >= 0;
      const victim = chosen ? s.sacrifice : thief.permanents.find((c) => c !== null);
      if (victim === undefined || victim === null) return;
      slot = removePermanent(s.state, s.player, victim, 'sacrificed', s.events);
    }
    thief.permanents[slot] = t.card;
    s.events.push({ type: 'permanentStolen', from: t.player, to: s.player, card: t.card, slot });
  },
});

// ── Passivos (lidos pelas regras) ────────────────────────────────────────────

const passive = <P>(params: z.ZodType<P>) => defineEffect({ params, target: 'none' });

/** Logística Orbital: Drones custam `coal` Carvão a menos (mínimo `min`). */
export const droneDiscount = passive(z.strictObject({ coal: Count, min: z.number().int().nonnegative() }));
/** Silos: +amount do recurso mais produzido, ao fim da Produção. */
export const silos = passive(z.strictObject({ amount: Count }));
/** Perfuração Profunda: Minas novas ganham tokens extras. */
export const mineTokensBonus = passive(z.strictObject({ amount: Count }));
/** Rede de Sensores: +alcance nos Postos. */
export const outpostRangeBonus = passive(z.strictObject({ amount: Count }));
/** Contraespionagem: permanentes não podem ser roubados. */
export const immuneToSteal = passive(None);
/** Automação de Extração: até `count` Parques produzem +amount. */
export const parkBonus = passive(z.strictObject({ count: Count, amount: Count }));
/** Núcleo de Navegação: Drones não custam recursos. */
export const freeDrones = passive(None);
/** Lente Ancestral: +alcance nos Postos e na Vila. */
export const rangeBonusAll = passive(z.strictObject({ amount: Count }));

/** Mapa Estelar: subsolo vizinho das suas estruturas revelado ao instalar e a cada construção. */
export const starMap = defineEffect({
  params: None,
  target: 'none',
  onInstall: (s) => autoSurveyAdjacent(s.ctx, s.state, s.player, s.events),
});
