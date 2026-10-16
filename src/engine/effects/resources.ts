/**
 * Efeitos de recurso e de ações do turno: Comboio, Cofre Precursor, Transmutação,
 * Pilhagem, Apoio Diplomático, Golpe Político.
 */
import { z } from 'zod';
import { RESOURCE_IDS, ResourceId } from '../../data/schemas';
import { getPlayer, type ResourceAmounts } from '../queries';
import { defineEffect, subjectOf } from './types';

const Amount = z.number().int().positive();

const one = (resource: ResourceId, amount: number): ResourceAmounts => {
  const out: ResourceAmounts = {};
  out[resource] = amount;
  return out;
};

/** Comboio / Cofre Precursor: recebe `amount` de um recurso escolhido (com exceções ou lista fechada). */
export const gainResourceChoice = defineEffect({
  params: z.strictObject({
    amount: Amount,
    exclude: z.array(ResourceId).optional(),
    only: z.array(ResourceId).optional(),
  }),
  target: 'resource',
  candidates: () => RESOURCE_IDS.map((resource) => ({ kind: 'resource' as const, resource })),
  check: (_s, p, t) =>
    p.exclude?.includes(t.resource) || (p.only && !p.only.includes(t.resource))
      ? { key: 'resourceNotAllowed' }
      : null,
  apply: (s, p, t) => {
    const player = subjectOf(s);
    getPlayer(s.state, player).resources[t.resource] += p.amount;
    s.events.push({ type: 'resourcesGained', player, resources: one(t.resource, p.amount), card: s.card });
  },
});

/** Transmutação: recebe um recurso fixo. */
export const gainResource = defineEffect({
  params: z.strictObject({ resource: ResourceId, amount: Amount }),
  target: 'none',
  apply: (s, p) => {
    const player = subjectOf(s);
    getPlayer(s.state, player).resources[p.resource] += p.amount;
    s.events.push({ type: 'resourcesGained', player, resources: one(p.resource, p.amount), card: s.card });
  },
});

/**
 * Pilhagem (interpretação Y): o remetente escolhe o recurso na entrega; o alvo perde até
 * `lose` (o que tiver) e o remetente recebe `gain` se o alvo perdeu ao menos 1.
 */
export const stealResource = defineEffect({
  params: z.strictObject({ lose: Amount, gain: Amount }),
  target: 'resource',
  candidates: () => RESOURCE_IDS.map((resource) => ({ kind: 'resource' as const, resource })),
  check: (s) => (s.recipient === null ? { key: 'notDeliverable' } : null),
  apply: (s, p, t) => {
    const victim = getPlayer(s.state, subjectOf(s));
    const lost = Math.min(p.lose, victim.resources[t.resource]);
    if (lost <= 0) return;
    victim.resources[t.resource] -= lost;
    s.events.push({
      type: 'resourcesLost',
      player: victim.id,
      resources: one(t.resource, lost),
      card: s.card,
    });
    getPlayer(s.state, s.player).resources[t.resource] += p.gain;
    s.events.push({
      type: 'resourcesGained',
      player: s.player,
      resources: one(t.resource, p.gain),
      card: s.card,
    });
  },
});

/** Apoio Diplomático: o alvo ganha ações no turno em que a carta é revelada. */
export const extraAction = defineEffect({
  params: z.strictObject({ amount: Amount }),
  target: 'none',
  apply: (s, p) => {
    s.state.actionsLeft += p.amount;
    s.events.push({
      type: 'actionsChanged',
      player: subjectOf(s),
      delta: p.amount,
      actionsLeft: s.state.actionsLeft,
    });
  },
});

/** Golpe Político: o alvo perde ações no turno em que a carta é revelada (mínimo 0). */
export const loseAction = defineEffect({
  params: z.strictObject({ amount: Amount }),
  target: 'none',
  apply: (s, p) => {
    const before = s.state.actionsLeft;
    s.state.actionsLeft = Math.max(0, before - p.amount);
    s.events.push({
      type: 'actionsChanged',
      player: subjectOf(s),
      delta: s.state.actionsLeft - before,
      actionsLeft: s.state.actionsLeft,
    });
  },
});
