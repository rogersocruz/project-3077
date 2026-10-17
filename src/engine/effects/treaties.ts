/**
 * Efeitos de carta da camada de tratados (Fase 8).
 */
import { z } from 'zod';
import { defineEffect } from './types';

/** Tratados Livres: o dono não paga o Ouro dos tratados (passivo; rules/treaties.ts). */
export const freeTreaties = defineEffect({
  params: z.strictObject({}),
  target: 'none',
  requires: ['treaties'],
});
