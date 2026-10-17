/** Tipos da IA (Fase 5). */
export type AiLevel = 'easy' | 'normal' | 'hard';

export function isAiLevel(x: unknown): x is AiLevel {
  return x === 'easy' || x === 'normal' || x === 'hard';
}

/**
 * Foco estratégico: trilha de vitória que o agente persegue (null = equilibrado, vai na
 * que estiver mais perto). O simulador sorteia focos para explorar todas as rotas.
 */
export type AiFocus = 'food' | 'stone' | 'iron' | 'coal' | 'oil' | 'gold' | 'expansion';
export const AI_FOCI: readonly AiFocus[] = ['food', 'stone', 'iron', 'coal', 'oil', 'gold', 'expansion'];
/** Rotas em que a Mina é o caminho principal (o subsolo é a fonte do recurso). */
export const MINE_FOCI: readonly AiFocus[] = ['oil', 'gold'];

export function isAiFocus(x: unknown): x is AiFocus {
  return (AI_FOCI as readonly unknown[]).includes(x);
}
