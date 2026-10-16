/**
 * Zoom de carta (UX_SPEC 2.7): carta grande com a placa "PROJETO 3077", gira levemente
 * com o mouse (paralaxe), texto completo, alvos válidos (destacados no mapa ao fundo
 * por useTargets) e cópias: quantas existem e quantas ainda não foram vistas.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePresentation } from '../../anim';
import { cardEnabled, DRAW_DECKS, type GameState } from '../../engine';
import { Card } from '../card/Card';
import { cardFace, cardVersion } from '../card/faces';
import { Icon } from '../components/Bits';
import { RichText } from '../components/RichText';
import { useSession } from '../game/session';
import { useUi } from '../game/uiStore';
import hud from '../hud/Hud.module.css';
import styles from './Cards.module.css';

/** Cópias que quem olha já viu: descartes, permanentes na mesa, fora do jogo e a própria mão. */
function seenCopies(state: GameState, id: string, viewer: number | null): number {
  const c = state.cards;
  const uids: number[] = [...c.removed];
  for (const d of DRAW_DECKS) uids.push(...c.discards[d]);
  for (const p of state.players) {
    for (const u of p.permanents) if (u !== null) uids.push(u);
    if (p.id === viewer) uids.push(...p.hand);
  }
  return uids.filter((u) => c.defs[u] === id).length;
}

export function CardZoom() {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const zoom = useUi((s) => s.zoom);
  const shown = usePresentation((s) => s.shown);
  const viewer = usePresentation((s) => s.viewer);
  const targetCount = useUi((s) => s.zoomTargets);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  if (!ctx || !zoom || !shown) return null;

  const id = 'card' in zoom ? (shown.cards.defs[zoom.card] ?? '') : zoom.id;
  const face = cardFace(id);
  const def = ctx.data.cards.find((c) => c.id === id);
  const inGame = shown.cards.defs.filter((d) => d === id).length;
  const seen = seenCopies(shown, id, viewer);
  const close = () => useUi.getState().setZoom(null);

  return (
    <div
      className={`${hud.overlay} ${styles.zoomOverlay}`}
      role="presentation"
      onClick={(e) => e.target === e.currentTarget && close()}
      onContextMenu={(e) => {
        e.preventDefault();
        close();
      }}
      onMouseMove={(e) => {
        const x = e.clientX / window.innerWidth - 0.5;
        const y = e.clientY / window.innerHeight - 0.5;
        setTilt({ x: -y * 10, y: x * 14 });
      }}
    >
      <div
        className={styles.zoom}
        role="dialog"
        aria-modal="true"
        aria-label={face.title}
        data-testid="card-zoom"
      >
        <div
          className={styles.zoomCard}
          style={{ transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
        >
          <div className={`${hud.plate} ${hud.rivets} ${styles.zoomPlate}`}>
            <span>{t('app.titleWord')}</span> <em>{t('app.titleNumber')}</em>
          </div>
          <Card face={face} width={360} version={cardVersion()} />
        </div>
        <aside className={`${hud.plate} ${hud.rivets} ${styles.zoomInfo}`}>
          <div className={hud.modalHead}>
            <h2 className={hud.modalTitle}>{face.title}</h2>
            <button
              type="button"
              className={`${hud.btn} ${hud.btnIcon}`}
              onClick={close}
              aria-label={t('common.close')}
            >
              <Icon glyph="close" size={14} />
            </button>
          </div>
          <div className={`${hud.paper} ${hud.modalBody} ${styles.zoomText}`}>
            <p>
              <RichText text={face.text} />
            </p>
            {def && (
              <dl className={styles.facts}>
                <dt>{t('hand.zoomRange')}</dt>
                <dd>
                  {t(`hand.range.${def.range.startsWith('radius') ? 'radius' : def.range}`, {
                    n: def.range.split(':')[1] ?? '',
                  })}
                </dd>
                <dt>{t('hand.zoomTargets')}</dt>
                <dd data-testid="zoom-targets">
                  {targetCount === null
                    ? t('hand.zoomNoTargets')
                    : t('hand.zoomTargetCount', { count: targetCount })}
                </dd>
                <dt>{t('hand.zoomCopies')}</dt>
                <dd>
                  {cardEnabled(def, shown.layers)
                    ? t('hand.copies', { total: inGame, unseen: Math.max(0, inGame - seen) })
                    : t('hand.notInDeck')}
                </dd>
              </dl>
            )}
          </div>
          <p className={hud.muted}>{t('hand.zoomHint')}</p>
        </aside>
      </div>
    </div>
  );
}
