/**
 * Cartas que dependem das regras do planeta (Fase 6): Guardião Desperto (Tesouro) e
 * Blindagem Sísmica (tecnologia passiva, lida pela regra de desastre).
 */
import { z } from 'zod';
import { defineEffect } from './types';

/**
 * Guardião Desperto: resolve na hora em que sai do Tesouro, no hex escavado (rules/world.ts
 * → drawTreasure). Até a Fase 7 fica parado e bloqueia escavar/construir (interpretação AK).
 */
export const spawnGuardian = defineEffect({
  params: z.strictObject({ strength: z.number().int().positive() }),
  target: 'hex',
  requires: ['specialHexes'],
  apply: (s, p, t) => {
    const hex = s.state.hexes[t.hex];
    if (!hex) return;
    hex.guardian = Math.max(hex.guardian ?? 0, p.strength);
    s.events.push({ type: 'guardianSpawned', hex: t.hex, strength: hex.guardian });
  },
});

/** Blindagem Sísmica: desastre só rebaixa as estruturas do dono (nível 1 não é destruída). */
export const disasterResist = defineEffect({
  params: z.strictObject({}),
  target: 'none',
  requires: ['events'],
});
