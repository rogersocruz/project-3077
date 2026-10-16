// Efeitos de carta: effectId → handler (registry.ts) e efeitos do mundo ainda sem regra (world.ts).
export { cardEnabled, CARD_EFFECTS, effectIssues, effectOf } from './registry';
export type { EffectHandler, ModifierKind, TargetKind } from './types';
export { WORLD_EFFECTS } from './world';
