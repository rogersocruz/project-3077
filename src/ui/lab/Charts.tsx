/**
 * Gráficos do Laboratório: barras horizontais de uma série só (rótulo em texto, valor
 * direto na ponta e dica no passar do mouse — identidade nunca só pela cor).
 */
import styles from './Lab.module.css';

export interface BarRow {
  readonly key: string;
  readonly label: string;
  /** 0–1 em relação ao maior valor. */
  readonly value: number;
  readonly display: string;
  readonly title?: string;
  /** Destaque (ex.: rota que ninguém vence). */
  readonly muted?: boolean;
}

export function BarList({
  rows,
  label,
  testId,
}: {
  rows: readonly BarRow[];
  label: string;
  testId?: string;
}) {
  const max = Math.max(1e-9, ...rows.map((r) => r.value));
  return (
    <ul className={styles.bars} aria-label={label} data-testid={testId}>
      {rows.map((r) => (
        <li key={r.key} className={styles.barRow} title={r.title ?? `${r.label}: ${r.display}`}>
          <span className={styles.barLabel}>{r.label}</span>
          <span className={styles.barTrack}>
            <span
              className={`${styles.bar} ${r.muted ? styles.barMuted : ''}`}
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </span>
          <span className={styles.barValue}>{r.display}</span>
        </li>
      ))}
    </ul>
  );
}
