/**
 * Efeitos de camadas futuras (PROMPTS Fase 4, item 4): o handler existe para o
 * effectId ser conhecido na carga, mas recusa com "camada desligada" e lança se for
 * aplicado. Essas cartas ficam fora do baralho até a regra entrar (interpretação U).
 */
import { z } from 'zod';
import type { LayerName } from '../state';
import { defineEffect, type TargetKind } from './types';

const Count = z.number().int().positive();

const gated = <P>(layer: LayerName, target: TargetKind, params: z.ZodType<P>) =>
  defineEffect({ params, target, requires: [layer], implemented: false });

// Tropas e combate (Fase 7)
export const troopStrengthBonus = gated('conflict', 'structure', z.strictObject({ amount: Count }));
export const troopRoot = gated('conflict', 'structure', z.strictObject({}));
export const revealTroops = gated('conflict', 'hex', z.strictObject({ radius: Count }));
export const freeRetreat = gated('conflict', 'hex', z.strictObject({}));
export const lineStrengthBonus = gated('conflict', 'none', z.strictObject({}));
export const antigrav = gated('conflict', 'none', z.strictObject({}));
export const spawnGuardian = gated('conflict', 'hex', z.strictObject({ strength: Count }));
// Tratados (Fase 8)
export const freeTreaties = gated('treaties', 'none', z.strictObject({}));
// Eventos e desastres (Fase 6)
export const disasterResist = gated('events', 'none', z.strictObject({}));
