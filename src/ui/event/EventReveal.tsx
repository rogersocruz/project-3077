/**
 * Cinemática do evento global (UX_SPEC 2.14 e 6): a mesa escurece, a carta horizontal vem
 * do baralho ao centro, gira e cresce; tinta da categoria por ~1 s e o efeito da
 * categoria (tremor, cinzas, chuva, distorção, horda, moedas); depois encolhe para o topo.
 * O diretor de animação liga e desliga (`eventReveal`); movimento reduzido = só fade.
 */
import type { CSSProperties } from 'react';
import { usePresentation } from '../../anim';
import { prefersReducedMotion } from '../../settings';
import styles from './Event.module.css';
import { EventCard } from './EventCard';
import { eventColor } from './eventData';

export function EventReveal() {
  const reveal = usePresentation((s) => s.eventReveal);
  if (!reveal) return null;
  const reduced = prefersReducedMotion();
  const style = { ['--event-color' as string]: eventColor(reveal.category) } as CSSProperties;
  return (
    <div
      className={`${styles.reveal} ${reduced ? styles.reduced : ''}`}
      style={style}
      data-testid="event-reveal"
    >
      <div className={styles.tint} />
      <div className={`${styles.fx} ${styles[`fx_${reveal.category}`] ?? ''}`} />
      <div className={styles.flying}>
        <EventCard id={reveal.event} size="large" />
      </div>
    </div>
  );
}
