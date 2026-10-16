import styles from './Shape.module.css';

/** Formas de token e símbolos de facção: a forma confirma o que a cor codifica (ART_DIRECTION 1.3). */
export type ShapeKind =
  | 'disc'
  | 'roundedCube'
  | 'hexPrism'
  | 'rhombus'
  | 'drop'
  | 'octagon'
  | 'circle'
  | 'square'
  | 'triangle'
  | 'hexagon'
  | 'pentagon';

interface ShapeProps {
  kind: ShapeKind;
  /** Nome da variável CSS da cor, ex.: "--resource-food-color". */
  colorVar: string;
  size?: number;
}

export function Shape({ kind, colorVar, size = 28 }: ShapeProps) {
  return (
    <span
      aria-hidden
      className={`${styles.shape} ${styles[kind]}`}
      style={{ width: size, height: size, background: `var(${colorVar})` }}
    />
  );
}
