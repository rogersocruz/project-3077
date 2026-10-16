/**
 * Cartas voando na interface (UX_SPEC 6): lê `p` de cada voo a cada quadro (o diretor
 * anima com GSAP) e posiciona por transform — sem re-render do React. Pontas: ponto 3D
 * projetado (render3d/projector), elemento da interface ou centro da tela. A carta vira
 * em 3D (verso ↔ face) e, no destino, se desfaz num anel da cor da categoria.
 */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type CardFlight, type FlightPoint, useCardFlights } from '../../anim/cardFlights';
import { screenOf } from '../../render3d/projector';
import { Card } from '../card/Card';
import { CardBack } from '../card/CardBack';
import { cardFace, cardVersion } from '../card/faces';
import { RichText } from '../components/RichText';
import { playerName } from '../game/text';
import { palette } from '../theme/tokens';
import styles from './Flights.module.css';

const W = 150;

function pointOf(p: FlightPoint): { x: number; y: number } {
  if (p.kind === 'world') {
    const s = screenOf(p.anchor);
    if (s) return s;
  } else if (p.kind === 'dom') {
    const el = document.querySelector(p.selector);
    if (el) {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
  }
  return { x: window.innerWidth / 2, y: window.innerHeight * 0.45 };
}

function FlightView({
  item,
  register,
}: {
  item: CardFlight;
  register: (id: number, el: HTMLDivElement | null) => void;
}) {
  return (
    <div ref={(el) => register(item.id, el)} className={styles.flight}>
      <div className={styles.inner} data-part="inner">
        <div className={styles.back}>
          <CardBack kind={item.back} width={W} />
        </div>
        {item.face && (
          <div className={styles.face}>
            <Card face={cardFace(item.face)} width={W} version={cardVersion()} />
          </div>
        )}
      </div>
      <div
        className={styles.burst}
        data-part="burst"
        style={{ ['--burst' as string]: palette.card[item.category].headerFrom }}
      />
    </div>
  );
}

export function CardFlights() {
  const items = useCardFlights((s) => s.items);
  const els = useRef(new Map<number, HTMLDivElement>());
  const ends = useRef(new Map<number, { a: { x: number; y: number }; b: { x: number; y: number } }>());

  useEffect(() => {
    if (items.length === 0) return;
    let raf = 0;
    const tick = () => {
      for (const item of items) {
        const el = els.current.get(item.id);
        if (!el) continue;
        // Pontas medidas na primeira vez (a câmera pode se mover; o voo segue a origem).
        let e = ends.current.get(item.id);
        if (!e) {
          e = { a: pointOf(item.from), b: pointOf(item.to) };
          ends.current.set(item.id, e);
        }
        const { t, flip, scale, fade, glow, burst } = item.p;
        const ctrlY = Math.min(e.a.y, e.b.y) - 90 - Math.abs(e.b.x - e.a.x) * 0.08;
        const u = 1 - t;
        const x = u * u * e.a.x + 2 * u * t * ((e.a.x + e.b.x) / 2) + t * t * e.b.x;
        const y = u * u * e.a.y + 2 * u * t * ctrlY + t * t * e.b.y;
        el.style.transform = `translate(${x}px, ${y}px)`;
        el.style.opacity = String(fade);
        const inner = el.querySelector<HTMLElement>('[data-part=inner]');
        if (inner) {
          inner.style.transform = `translate(-50%, -50%) scale(${scale}) rotateY(${180 - flip * 180}deg)`;
          inner.style.filter = glow > 0 ? `drop-shadow(0 0 ${8 + glow * 24}px ${palette.accent.orange})` : '';
          inner.style.visibility = burst > 0.2 ? 'hidden' : 'visible';
        }
        const ring = el.querySelector<HTMLElement>('[data-part=burst]');
        if (ring) {
          ring.style.opacity = burst > 0 ? String(1 - burst) : '0';
          ring.style.transform = `translate(-50%, -50%) scale(${0.3 + burst * 1.6})`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [items]);

  useEffect(() => {
    const live = new Set(items.map((i) => i.id));
    for (const id of ends.current.keys()) if (!live.has(id)) ends.current.delete(id);
  }, [items]);

  if (items.length === 0) return null;
  return (
    <div className={styles.layer} aria-hidden>
      {items.map((item) => (
        <FlightView
          key={item.id}
          item={item}
          register={(id, el) => {
            if (el) els.current.set(id, el);
            else els.current.delete(id);
          }}
        />
      ))}
    </div>
  );
}

/** Legenda da carta no centro: quem entregou, se ficou sem efeito; ou quem pegou do baralho. */
export function CardCaption() {
  const { t } = useTranslation();
  const caption = useCardFlights((s) => s.caption);
  if (!caption) return null;
  const face = cardFace(caption.id);
  return (
    <div className={styles.caption} role="status" aria-live="polite" data-testid="card-caption">
      <span className={styles.captionKicker}>
        {caption.kind === 'reveal'
          ? `${t('reveal.title')} · ${t('reveal.from', { name: playerName(t, caption.from) })}`
          : t('reveal.taken', { name: playerName(t, caption.player), deck: t(`cards.deck.${caption.deck}`) })}
      </span>
      <strong className={styles.captionTitle}>{face.title}</strong>
      <span className={styles.captionText}>
        <RichText text={face.text} />
      </span>
      {caption.kind === 'reveal' && caption.fizzled && (
        <span className={styles.captionFizzled}>
          {t('reveal.fizzled', { reason: t(`engine.illegal.${caption.fizzled}`) })}
        </span>
      )}
    </div>
  );
}
