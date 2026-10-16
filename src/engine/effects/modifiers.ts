/**
 * Cartas que só valem junto com outra ação. Não têm `apply`: o reducer de Sondar e
 * Construir lê o parâmetro (legal.ts → modifiers).
 */
import { z } from 'zod';
import { defineEffect } from './types';

/** Drone I/II/III (GDD 6.5): +bonus no raio de Sondar ou Construir; Sondar atravessa fronteira. */
export const droneRange = defineEffect({
  params: z.strictObject({ bonus: z.number().int().positive() }),
  target: 'none',
  modifier: 'drone',
});

/** Contrato de Obra: a construção paga metade do custo (interpretação AH). */
export const halfCostBuild = defineEffect({
  params: z.strictObject({}),
  target: 'none',
  modifier: 'halfCost',
});
