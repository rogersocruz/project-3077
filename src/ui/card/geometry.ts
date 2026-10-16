/** Medidas da carta (63 × 88 mm em unidades de 0,1 mm) e contorno chanfrado. */

export const CARD_W = 630;
export const CARD_H = 880;

/** Contorno chanfrado (cantos cortados) de um retângulo. */
export function chamferPath(x: number, y: number, w: number, h: number, c: number): string {
  return `M${x + c},${y}H${x + w - c}L${x + w},${y + c}V${y + h - c}L${x + w - c},${y + h}H${x + c}L${x},${y + h - c}V${y + c}Z`;
}
