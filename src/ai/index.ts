// Agentes heurísticos fácil/normal/difícil (Fase 5); só consomem engine/legal.ts.
export { type Agent, chooseAction, createAgent } from './agent';
export { evaluate, evaluateParts } from './evaluate';
export { type AiLevel, isAiLevel } from './types';
export { AI_LEVELS, type AiWeights, DEFAULT_WEIGHTS } from './weights';
