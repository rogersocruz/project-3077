/**
 * Tempos de animação em segundos, a 1× (ART_DIRECTION 7: ações 250–450 ms,
 * cinemáticas 900–1600 ms, cascata de produção com 40 ms entre hexes). Só aparência.
 */
export const T = {
  phaseStep: 0.12,
  turnBeat: 0.2,
  roundBanner: 1.2,
  tileLift: 0.14,
  tileFlip: 0.2,
  tileSettle: 0.26,
  revealStagger: 0.07,
  dust: 0.5,
  fade: 0.35,
  scan: 0.6,
  tilt: 0.42,
  rise: 0.42,
  sparks: 0.55,
  levelUp: 0.7,
  token: 0.48,
  tokenStagger: 0.06,
  productionStagger: 0.04,
  vaultHold: 0.2,
  idle: 0.6,
  /** No máximo N tokens voando por transferência (o resto entra direto no contador). */
  maxTokens: 4,
  // Cartas (Fase 4): voos de 250–450 ms; revelação é cinemática (900–1600 ms).
  cardFly: 0.45,
  cardStagger: 0.12,
  burst: 0.4,
  envelope: 0.9,
  revealFlip: 0.5,
  revealHold: 0.8,
  steal: 0.75,
  sink: 0.5,
  // Eventos globais (Fase 6): cinemática 900–1600 ms (ART_DIRECTION 7).
  eventReveal: 1.6,
  eventRevealReduced: 0.7,
  eventPulse: 2.5,
  /** Fase 7: painel de combate (cinemática curta). */
  combatPanel: 1.8,
  /** Selo de tratado (assinatura, disparo, quebra). */
  treatySeal: 1.4,
  /** IA (Fase 5): pausa antes de cada decisão, para a mesa ser legível. */
  aiThink: 0.35,
} as const;

export const EASE = {
  out: 'power3.out',
  inOut: 'power2.inOut',
  settle: 'back.out(1.4)',
  flight: 'power1.inOut',
} as const;
