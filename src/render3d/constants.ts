/**
 * Medidas da cena (unidades de mundo). Só aparência — nenhum número de regra.
 * Escala: raio circunscrito do hex = 1.
 */
export const HEX_RADIUS = 1;
export const SQRT3 = Math.sqrt(3);

/** Placa escura do tabuleiro sob os tiles. */
export const BOARD_PLATE_HEIGHT = 0.06;
/** Tile = papelão grosso laminado (ART_DIRECTION 5). */
export const TILE_HEIGHT = 0.16;
export const TILE_BEVEL = 0.045;
/** Folga entre tiles vizinhos (fração do raio). */
export const TILE_SCALE = 0.955;
export const TILE_TOP_Y = BOARD_PLATE_HEIGHT + TILE_HEIGHT;

export const TRAY = {
  width: 7.6,
  depth: 2.7,
  height: 0.16,
  /** Distância livre entre a borda do tabuleiro e a bandeja. */
  gap: 0.9,
} as const;

/** Pilhas de tokens na bandeja. */
export const TOKEN = {
  radius: 0.17,
  thickness: 0.055,
  perColumn: 10,
  maxColumns: 3,
} as const;

/** Carta permanente na bandeja (63 × 88 mm). */
export const CARD = { width: 0.63, height: 0.88, thickness: 0.012 } as const;

export const CAMERA = {
  fov: 38,
  /** Pitch 25°–80° acima do horizonte (UX_SPEC 4) → ângulo polar a partir da vertical. */
  minPolar: (10 * Math.PI) / 180,
  maxPolar: (65 * Math.PI) / 180,
  /** Zoom mínimo ≈ um único tile. */
  minDistance: 2.4,
  boardPolar: (48 * Math.PI) / 180,
  overviewPolar: (40 * Math.PI) / 180,
  hexPolar: (52 * Math.PI) / 180,
  hexDistance: 3.4,
  panSpeed: 9,
} as const;
