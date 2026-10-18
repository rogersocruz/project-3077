/**
 * Carregamento (UX_SPEC 2.4): tiles caem do baralho e se encaixam em espiral, cada tabuleiro
 * na cor da facção; dica de regra ou trecho de lore no rodapé (rotativo). Some quando a cena
 * 3D desenhou os primeiros quadros (`data-scene-ready` no <body>).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { prefersReducedMotion } from '../../settings';
import { palette } from '../theme/tokens';
import styles from './Loading.module.css';

/** Posições de uma roseta de hexes em espiral (anéis 0–2), em pixels. */
function spiral(rings: number, size: number): { x: number; y: number; ring: number }[] {
  const out = [{ x: 0, y: 0, ring: 0 }];
  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
  ] as const;
  for (let r = 1; r <= rings; r++) {
    let q = -r;
    let s = r;
    for (const [dq, ds] of dirs)
      for (let i = 0; i < r; i++) {
        out.push({ x: size * 1.5 * q, y: size * Math.sqrt(3) * (s + q / 2), ring: r });
        q += dq;
        s += ds;
      }
  }
  return out;
}

const TIPS = 6;

function ready(): boolean {
  return typeof document !== 'undefined' && document.body.dataset['sceneReady'] === '1';
}

export function LoadingScreen({ factions }: { factions: readonly string[] }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(ready);
  const [tip, setTip] = useState(0);
  const tiles = useMemo(() => spiral(2, 18), []);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (done) return;
    const obs = new MutationObserver(() => ready() && setDone(true));
    obs.observe(document.body, { attributes: true, attributeFilter: ['data-scene-ready'] });
    const id = window.setInterval(() => setTip((n) => (n + 1) % TIPS), 3500);
    return () => {
      obs.disconnect();
      window.clearInterval(id);
    };
  }, [done]);

  if (done) return null;
  const colors = factions.length
    ? factions.map((f) => palette.faction[f as keyof typeof palette.faction]?.color ?? palette.accent.orange)
    : [palette.accent.orange];
  return (
    <div className={styles.loading} role="status" aria-live="polite" data-testid="loading">
      <svg viewBox="-120 -120 240 240" className={styles.rosette} aria-hidden="true">
        {tiles.map((h, i) => (
          <polygon
            key={i}
            points={Array.from({ length: 6 }, (_, k) => {
              const a = (Math.PI / 3) * k;
              return `${h.x + 17 * Math.cos(a)},${h.y + 17 * Math.sin(a)}`;
            }).join(' ')}
            fill={colors[i % colors.length]}
            className={reduced ? '' : styles.tile}
            style={{ animationDelay: `${i * 70}ms` }}
          />
        ))}
      </svg>
      <p className={styles.title}>{t('loading.title')}</p>
      <p className={styles.tip}>{t(`loading.tip${tip}`)}</p>
    </div>
  );
}
