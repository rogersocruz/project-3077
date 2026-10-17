/**
 * Gráfico de linhas pequeno (um por métrica, mesmo eixo X = rodada): linha de 2 px por
 * jogador na cor da facção (identidade), grade discreta, rótulo no fim de cada linha e dica
 * ao passar o mouse em cada ponto. Sem segundo eixo.
 */
import styles from './End.module.css';

export interface Series {
  readonly id: number;
  readonly name: string;
  readonly color: string;
  readonly points: readonly { readonly x: number; readonly y: number }[];
}

const W = 340;
const H = 170;
const PAD = { l: 34, r: 12, t: 10, b: 22 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function LineChart({
  title,
  unit,
  series,
}: {
  title: string;
  unit: string;
  series: readonly Series[];
}) {
  const xs = series.flatMap((s) => s.points.map((p) => p.x));
  const ys = series.flatMap((s) => s.points.map((p) => p.y));
  if (xs.length === 0) return null;
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs, x0 + 1);
  const yMax = niceMax(Math.max(...ys, 0));
  const sx = (x: number) => PAD.l + ((x - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
  const sy = (y: number) => H - PAD.b - (y / yMax) * (H - PAD.t - PAD.b);
  const ticks = [0, yMax / 2, yMax];
  const rounds = [...new Set(xs)].sort((a, b) => a - b);
  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chartTitle}>
        {title} <span className={styles.unit}>({unit})</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} className={styles.grid} />
            <text x={PAD.l - 6} y={sy(v)} className={styles.tick} textAnchor="end" dominantBaseline="middle">
              {Math.round(v)}
            </text>
          </g>
        ))}
        {rounds.map((r) => (
          <text key={r} x={sx(r)} y={H - 6} className={styles.tick} textAnchor="middle">
            {r}
          </text>
        ))}
        {series.map((s) => {
          const d = s.points
            .map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
            .join(' ');
          return (
            <g key={s.id}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
              {s.points.map((p) => (
                <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r={6} className={styles.hit}>
                  <title>{`${s.name} · ${p.x}: ${p.y}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
