/**
 * Carta de evento horizontal (ART_DIRECTION 4 "Variações": 88 × 63 mm, header na cor da
 * categoria, ilustração panorâmica). Desenhada no DOM: só aparece na interface (topo do
 * HUD, cinemática, zoom), nunca como textura 3D. Ilustração = substituto procedural.
 */
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { IconSilhouette } from '../card/glyphs';
import { RichText } from '../components/RichText';
import { palette } from '../theme/tokens';
import styles from './Event.module.css';
import { eventColor, eventDef } from './eventData';

export function EventCard({ id, size = 'normal' }: { id: string; size?: 'mini' | 'normal' | 'large' }) {
  const { t } = useTranslation();
  const def = eventDef(id);
  if (!def) return null;
  const style = { ['--event-color' as string]: eventColor(def.category) } as CSSProperties;
  return (
    <article
      className={`${styles.card} ${styles[size]}`}
      style={style}
      data-testid={size === 'mini' ? undefined : 'event-card'}
      data-event={id}
      aria-label={`${def.name} — ${t(`events.category.${def.category}`)}`}
    >
      <header className={styles.header}>
        <svg className={styles.headIcon} viewBox="-12 -12 24 24" aria-hidden>
          <IconSilhouette id="card-event" size={20} fill={palette.paper[100]} />
        </svg>
        <span className={styles.name}>{def.name}</span>
        <span className={styles.category}>{t(`events.category.${def.category}`)}</span>
      </header>
      {size !== 'mini' && (
        <>
          <div className={`${styles.art} ${styles[`art_${def.category}`] ?? ''}`} aria-hidden>
            <svg viewBox="0 0 300 80" preserveAspectRatio="none">
              <path
                d="M0,80 L0,48 40,30 80,44 130,18 170,40 220,24 260,42 300,30 300,80Z"
                className={styles.ridgeFar}
              />
              <path
                d="M0,80 L0,60 50,46 100,58 150,40 200,56 250,44 300,58 300,80Z"
                className={styles.ridgeNear}
              />
            </svg>
          </div>
          <p className={styles.effect}>
            <RichText text={def.effect} />
          </p>
        </>
      )}
    </article>
  );
}
