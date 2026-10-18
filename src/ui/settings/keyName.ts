/** Nome legível de tecla para a tela de atalhos. */
const ARROWS: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };

/** Nome legível de um `KeyboardEvent.code`. */
export function keyName(code: string): string {
  return ARROWS[code] ?? code.replace(/^Key/, '').replace(/^Digit/, '');
}
