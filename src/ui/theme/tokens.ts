/**
 * Tokens de tema — ART_DIRECTION.md seções 2 (paleta) e 3 (tipografia).
 * Única origem de cor do projeto: nada de hex solto em componente ou CSS.
 * Os CSS Modules consomem as variáveis geradas por `cssVariables()` (ex.: var(--frame-900)).
 */

export const palette = {
  // 2.1 Base (moldura e interface)
  frame: { 900: '#141A24', 800: '#1E2633', 700: '#2B3545', edge: '#8A94A3' },
  accent: { orange: '#FF7A1A' },
  paper: { 100: '#F4EDDD', 300: '#E2D7BF' },
  ink: { 900: '#1C1A17', 600: '#4A453D' },

  // 2.2 Categorias de carta: header em gradiente (from → to) e fita do tipo
  card: {
    tech: { headerFrom: '#2F5D86', headerTo: '#1F3F5E', ribbon: '#24486B', icon: 'atom' },
    delivered: { headerFrom: '#8E2B20', headerTo: '#5E1B14', ribbon: '#7A231A', icon: 'target' },
    own: { headerFrom: '#6B6A3A', headerTo: '#4A4A27', ribbon: '#5B5A31', icon: 'insignia' },
    contract: { headerFrom: '#C99A2E', headerTo: '#8F6B1C', ribbon: '#B3862A', icon: 'handshake' },
    relic: { headerFrom: '#5B3F8C', headerTo: '#3B2860', ribbon: '#4C3476', icon: 'gem' },
  },

  // 2.3 Eventos
  event: {
    seismic: { color: '#8C6A4A', icon: 'crack' },
    thermal: { color: '#D2491E', icon: 'flame' },
    climatic: { color: '#3E8E5A', icon: 'leaf' },
    atmospheric: { color: '#4F8FC0', icon: 'swirl' },
    horde: { color: '#7A1F3D', icon: 'claw' },
    economic: { color: '#C99A2E', icon: 'coin' },
  },

  // 2.4 Recursos (cor + forma do token)
  resource: {
    food: { color: '#7FB34A', shape: 'disc', icon: 'sprig' },
    stone: { color: '#A8A49A', shape: 'roundedCube', icon: 'rock' },
    iron: { color: '#7FA6C9', shape: 'hexPrism', icon: 'ingot' },
    coal: { color: '#3D3B38', shape: 'rhombus', icon: 'coalRock' },
    oil: { color: '#5A4A8A', shape: 'drop', icon: 'barrel' },
    gold: { color: '#E8B64A', shape: 'octagon', icon: 'coin' },
  },

  // 2.5 Facções (cor + símbolo)
  faction: {
    revolutionaries: { color: '#D64541', symbol: 'circle' },
    government: { color: '#3A7BD5', symbol: 'square' },
    helix: { color: '#E89A2C', symbol: 'triangle' },
    vantage: { color: '#7E6BD6', symbol: 'rhombus' },
    pirates: { color: '#6E6C66', symbol: 'hexagon' },
    natives: { color: '#22A07A', symbol: 'pentagon' },
  },

  /**
   * Estados de interface (Fase 3). O ART_DIRECTION pede vermelho para custo não pago e
   * troco perdido (UX_SPEC 2.10, 7.3) sem fixar o tom: provisório, ajustar só aqui.
   */
  ui: { danger: '#E5533D', positive: '#8CC152' },
} as const;

/**
 * Cena 3D — ART_DIRECTION 5 (tiles, estruturas), 6 (mesa e ambiente) e 8 (efeitos).
 * O documento não fixa estes valores: são provisórios, escolhidos para o clima de
 * "noite de board game" com terreno pintado saturado. Ajustar só aqui.
 */
export const scene = {
  // Terreno: [sombra, base, luz, detalhe] — o pintor procedural mistura entre eles.
  terrain: {
    empty: ['#7A6A3E', '#A8955A', '#CDBB7A', '#6E8A3C'],
    forest: ['#1F4A24', '#2F6B2E', '#5E9A3A', '#8CC152'],
    lagoon: ['#1D5A7A', '#2E86A8', '#7CC7D8', '#D9C58E'],
    mountain: ['#5A5048', '#857A6C', '#B8AE9E', '#EEF0F2'],
    vein_iron: ['#4A4E55', '#6E747C', '#9AA3AD', '#BFD7EE'],
    vein_coal: ['#2A2622', '#4A4038', '#6E6152', '#151413'],
    vein_gold: ['#6E4E2A', '#9A7444', '#C49A5E', '#FFD15A'],
    temple: ['#6A6A5A', '#9C9880', '#D2CCB0', '#F0E6C8'],
    ruin: ['#5E4E3E', '#86705A', '#AE9878', '#4F6E3A'],
    volcano: ['#1E1816', '#3A2C26', '#5E463A', '#FF6A1A'],
    geyser: ['#6E8A94', '#B8C4C0', '#EEF0E8', '#4FC0D8'],
    acid_swamp: ['#3A4A1A', '#5E7A22', '#9ABE2E', '#E4F04A'],
    wind_canyon: ['#7A3E22', '#B0643A', '#DE9A62', '#4A2416'],
    thin_crust: ['#5E5650', '#9A9088', '#CEC6BC', '#FF8A3A'],
    free_port: ['#3A4048', '#5E6670', '#8A949E', '#FFB21A'],
    magnetic_anomaly: ['#2E2A4A', '#4E4678', '#7E74B0', '#B89CFF'],
  },
  /** Verso do tile (névoa): metal escuro com grade gravada. */
  fog: { base: '#262E3A', grid: '#3A4556', glyph: '#7E8A9C', glyphGlow: '#9AA6B8' },
  /** Filete dourado dos hazards. */
  hazardRim: '#D9A93A',
  wood: { dark: '#3A2214', mid: '#5E3A22', light: '#8A5A34', grain: '#2A180E' },
  /** Fundo em penumbra ao redor da mesa. */
  backdrop: '#0B0E14',
  light: { key: '#FFD9A8', fill: '#8FB0E0', ambientSky: '#3A4A6A', ambientGround: '#2A1A10' },
  /** Corpo neutro das miniaturas; as faixas vêm da cor da facção. */
  structure: { body: '#E6DECB', roof: '#6E7682', metal: '#B4BCC6', dark: '#3A404A', glow: '#FFC46A' },
  /** Destaque de hover (laranja da interface) e seleção. */
  highlight: { hover: '#FF7A1A', select: '#FFC46A' },
  /**
   * Alvos válidos ao escolher uma ação: contorno animado na cor da ação; inválidos
   * escurecidos (ART_DIRECTION 8). O documento não fixa as cores por ação: provisórias.
   */
  action: {
    explore: '#FFB547',
    survey: '#4FC0D8',
    build: '#FF7A1A',
    upgrade: '#FFD15A',
    chooseVillage: '#FF7A1A',
    /** Alvo de carta sem categoria definida (as cartas usam a cor da categoria). */
    card: '#FFC46A',
    /** Fase 7: destino de movimento de tropas (provisória). */
    move: '#F2694B',
  },
  dim: '#05070B',
  /** Efeitos (Fase 3): poeira ao assentar tile, varredura da sondagem, Mina parada. */
  fx: { dust: '#C9B48A', scan: '#4FC0D8', idle: '#E5533D', vault: '#E8B64A' },
  star: '#FFD15A',
  /** Objetos de mesa (desligáveis): caneca e caixa do jogo. */
  props: { mug: '#B8452E', coffee: '#2A160C', box: '#1E2633' },
} as const;

export type TerrainPaletteKey = keyof typeof scene.terrain;

// 3. Tipografia — arquivos servidos localmente via @fontsource (ver fonts.ts)
export const fonts = {
  /** Títulos de carta, botões, cabeçalhos — 700, MAIÚSCULAS */
  display: '"Barlow Condensed", "Arial Narrow", sans-serif',
  /** Números grandes (força, contadores) — 700 */
  numeric: '"Rajdhani", "Barlow Condensed", sans-serif',
  /** Texto de efeito, interface — 500/700; lore e diálogos em itálico 400 */
  body: '"Barlow", system-ui, sans-serif',
} as const;

export const fontWeights = { regular: 400, medium: 500, bold: 700 } as const;

export type ResourceKey = keyof typeof palette.resource;
export type FactionKey = keyof typeof palette.faction;
export type EventKey = keyof typeof palette.event;
export type CardCategoryKey = keyof typeof palette.card;

/** Achata a paleta em variáveis CSS: palette.frame[900] → --frame-900. */
export function cssVariables(): Record<string, string> {
  const vars: Record<string, string> = {};
  const walk = (node: unknown, prefix: string) => {
    if (typeof node === 'string') {
      if (node.startsWith('#')) vars[`--${prefix}`] = node;
      return;
    }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, prefix ? `${prefix}-${k}` : k);
    }
  };
  walk(palette, '');
  vars['--font-display'] = fonts.display;
  vars['--font-numeric'] = fonts.numeric;
  vars['--font-body'] = fonts.body;
  return vars;
}
