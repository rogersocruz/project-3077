/**
 * Mão em leque na base da mesa (UX_SPEC 2.5 e 6): só a de quem está diante da tela
 * (privacidade do hotseat). Passar o mouse levanta 30 px, amplia 1.15 e inclina para o
 * cursor; clique usa a carta; botão direito abre o zoom; arrastar leva a carta até o
 * alvo no mapa (hex/estrutura) ou até o retrato de um jogador (entrega).
 */
import { type PointerEvent as ReactPointerEvent, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePresentation } from '../../anim';
import type { CardUid } from '../../engine';
import { useSceneStore } from '../../render3d/sceneStore';
import { Card } from '../card/Card';
import { cardFace, cardVersion } from '../card/faces';
import { isBlocked } from '../game/cardFlow';
import { actOnHex, chooseRecipient, selectCard } from '../game/commands';
import { useCanDecide } from '../game/hooks';
import { useSession } from '../game/session';
import { useUi } from '../game/uiStore';
import styles from './Hand.module.css';

const WIDTH = 116;
const DRAG_SLOP = 8;

interface Drag {
  readonly card: CardUid;
  readonly x0: number;
  readonly y0: number;
  moved: boolean;
}

function HandCard({
  uid,
  id,
  index,
  count,
  blocked,
  selected,
  enabled,
  onDragStart,
  dragging,
  offset,
}: {
  uid: CardUid;
  id: string;
  index: number;
  count: number;
  blocked: boolean;
  selected: boolean;
  enabled: boolean;
  onDragStart: (e: ReactPointerEvent, card: CardUid) => void;
  dragging: boolean;
  offset: { x: number; y: number };
}) {
  const { t } = useTranslation();
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const mid = (count - 1) / 2;
  const spread = Math.min(7, 30 / Math.max(1, count - 1));
  const angle = (index - mid) * spread;
  const step = Math.min(WIDTH * 0.78, 520 / Math.max(1, count));
  const x = (index - mid) * step;
  const y = Math.abs(index - mid) ** 2 * 2.4;
  const face = cardFace(id);
  return (
    <button
      type="button"
      className={`${styles.card} ${selected ? styles.selected : ''} ${dragging ? styles.dragging : ''}`}
      style={{
        ['--x' as string]: `${x + offset.x}px`,
        ['--y' as string]: `${y + offset.y}px`,
        ['--r' as string]: `${dragging ? 0 : angle}deg`,
        ['--tx' as string]: `${tilt.x}deg`,
        ['--ty' as string]: `${tilt.y}deg`,
        zIndex: dragging || selected ? 50 : index + 1,
      }}
      disabled={!enabled}
      aria-pressed={selected}
      aria-label={t('hand.cardLabel', { title: face.title })}
      data-testid={`hand-card-${uid}`}
      data-card-id={id}
      onPointerDown={(e) => enabled && e.button === 0 && onDragStart(e, uid)}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setTilt({
          x: ((e.clientY - r.top) / r.height - 0.5) * -10,
          y: ((e.clientX - r.left) / r.width - 0.5) * 12,
        });
      }}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
      onContextMenu={(e) => {
        e.preventDefault();
        useUi.getState().setZoom({ card: uid });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectCard(uid);
        }
      }}
    >
      <Card face={face} width={WIDTH} version={cardVersion()} blocked={blocked} />
    </button>
  );
}

export function Hand() {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const state = useSession((s) => s.state);
  const shown = usePresentation((s) => s.shown);
  const viewer = usePresentation((s) => s.viewer);
  const flow = useUi((s) => s.flow);
  const canDecide = useCanDecide();
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<{ card: CardUid; x: number; y: number } | null>(null);

  const hand = useMemo(
    () => (shown && viewer !== null ? (shown.players[viewer]?.hand ?? []) : []),
    [shown, viewer],
  );
  if (!ctx || !state || !shown || viewer === null || !shown.layers.cards || hand.length === 0) return null;

  const onDragStart = (e: ReactPointerEvent, card: CardUid) => {
    drag.current = { card, x0: e.clientX, y0: e.clientY, moved: false };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = ev.clientX - d.x0;
      const dy = ev.clientY - d.y0;
      if (!d.moved && Math.hypot(dx, dy) > DRAG_SLOP) {
        d.moved = true;
        if (useUi.getState().flow?.card !== d.card) selectCard(d.card);
      }
      if (d.moved) setDragging({ card: d.card, x: dx, y: dy });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const d = drag.current;
      drag.current = null;
      setDragging(null);
      if (!d) return;
      if (!d.moved) {
        selectCard(d.card);
        return;
      }
      // Soltou sobre um retrato: destinatário da entrega; sobre a mesa: alvo no hex.
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const portrait = el?.closest<HTMLElement>('[data-player]');
      if (portrait && useUi.getState().flow?.mode === 'deliver') {
        chooseRecipient(Number(portrait.dataset['player']));
        return;
      }
      const hovered = useSceneStore.getState().hovered;
      if (hovered && el?.closest('canvas')) actOnHex(hovered);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className={styles.hand} aria-label={t('hand.title', { n: hand.length })} data-testid="hand">
      {hand.map((uid, i) => {
        const id = shown.cards.defs[uid];
        if (id === undefined) return null;
        return (
          <HandCard
            key={uid}
            uid={uid}
            id={id}
            index={i}
            count={hand.length}
            blocked={isBlocked(ctx, state, viewer, uid)}
            selected={flow?.card === uid}
            enabled={canDecide}
            onDragStart={onDragStart}
            dragging={dragging?.card === uid}
            offset={dragging?.card === uid ? { x: dragging.x, y: dragging.y } : { x: 0, y: 0 }}
          />
        );
      })}
    </div>
  );
}
