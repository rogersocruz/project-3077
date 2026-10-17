/**
 * Efeitos de camadas futuras (PROMPTS Fase 4, item 4): o handler existe para o
 * effectId ser conhecido na carga, mas recusa com "camada desligada" e lança se for
 * aplicado. Essas cartas ficam fora do baralho até a regra entrar (interpretação U).
 */
import { z } from 'zod';
import type { LayerName } from '../state';
import { defineEffect, type TargetKind } from './types';

const gated = <P>(layer: LayerName, target: TargetKind, params: z.ZodType<P>) =>
  defineEffect({ params, target, requires: [layer], implemented: false });

// Tratados (Fase 8)
export const freeTreaties = gated('treaties', 'none', z.strictObject({}));
