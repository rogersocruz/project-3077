/**
 * Escolhas que travam a partida até a resposta: linha de compra da Universidade
 * (GDD 6.4), carta da Requisição Prioritária (vê as do topo e pega uma) e descarte até
 * o limite de mão antes de encerrar a Entrega (GDD 6.2 fase 7).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePresentation } from '../../anim';
import { type CardUid, decider, drawRows, handLimit } from '../../engine';
import { maxLevelOf } from '../../engine/queries';
import { CardBack } from '../card/CardBack';
import { perform, useCanDecide } from '../game/hooks';
import { useSession } from '../game/session';
import { useUi } from '../game/uiStore';
import hud from '../hud/Hud.module.css';
import styles from './Cards.module.css';
import { MiniCard } from './MiniCard';

/** Quem está diante da tela decide agora (sem fila tocando). */
function useMyDecision(): number | null {
  const state = useSession((s) => s.state);
  const viewer = usePresentation((s) => s.viewer);
  const canDecide = useCanDecide();
  return canDecide && state && viewer !== null && decider(state) === viewer ? viewer : null;
}

export function DrawChoice() {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const state = useSession((s) => s.state);
  const me = useMyDecision();
  if (!ctx || !state || me === null || state.stage !== 'playing' || state.phase !== 'draw' || state.pending) {
    return null;
  }
  const rows = drawRows(ctx, state, me);
  const level = maxLevelOf(state, me, 'university');
  return (
    <div className={hud.overlay} role="presentation">
      <div
        className={`${hud.plate} ${hud.rivets} ${hud.modal} ${styles.choiceModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="draw-title"
        data-testid="draw-choice"
      >
        <h2 id="draw-title" className={hud.modalTitle}>
          {t('hand.drawTitle')} <em>{t('hand.drawLevel', { level })}</em>
        </h2>
        <p className={hud.muted}>{t('hand.drawHint')}</p>
        <div className={styles.drawRows}>
          {rows.map((row, i) => (
            <button
              key={i}
              type="button"
              className={`${hud.btn} ${styles.drawRow}`}
              onClick={() => perform({ type: 'chooseDraw', player: me, row: i })}
              data-testid={`draw-row-${i}`}
              autoFocus={i === 0}
            >
              {row.map((d) => (
                <span key={d.deck} className={styles.drawItem}>
                  {Array.from({ length: d.count }, (_, k) => (
                    <CardBack key={k} kind={d.deck} width={44} />
                  ))}
                  <span>{t('hand.drawCount', { count: d.count, deck: t(`cards.deck.${d.deck}`) })}</span>
                </span>
              ))}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TutorChoice() {
  const { t } = useTranslation();
  const state = useSession((s) => s.state);
  const me = useMyDecision();
  const pending = state?.pending;
  if (!state || !pending || me === null || pending.player !== me) return null;
  return (
    <div className={hud.overlay} role="presentation">
      <div
        className={`${hud.plate} ${hud.rivets} ${hud.modal} ${styles.tutorModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutor-title"
        data-testid="tutor-choice"
      >
        <h2 id="tutor-title" className={hud.modalTitle}>
          {t('hand.tutorTitle')} <em>{t(`cards.deck.${pending.deck}`)}</em>
        </h2>
        <p className={hud.muted}>{t('hand.tutorHint')}</p>
        <div className={styles.choices}>
          {pending.options.map((c) => (
            <MiniCard
              key={c}
              uid={c}
              id={state.cards.defs[c] ?? ''}
              width={132}
              onClick={() => perform({ type: 'resolveChoice', player: me, card: c })}
              testid={`tutor-${c}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function DiscardModal() {
  const { t } = useTranslation();
  const ctx = useSession((s) => s.ctx);
  const state = useSession((s) => s.state);
  const [chosen, setChosen] = useState<CardUid[]>([]);
  if (!ctx || !state) return null;
  const me = state.activePlayer;
  const hand = state.players[me]?.hand ?? [];
  const need = hand.length - handLimit(ctx, state, me);
  const close = () => useUi.getState().open(null);
  const toggle = (c: CardUid) =>
    setChosen((cur) =>
      cur.includes(c) ? cur.filter((x) => x !== c) : cur.length < need ? [...cur, c] : cur,
    );
  return (
    <div className={hud.overlay} role="presentation" onClick={(e) => e.target === e.currentTarget && close()}>
      <div
        className={`${hud.plate} ${hud.rivets} ${hud.modal} ${styles.tutorModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="discard-title"
        data-testid="discard-modal"
      >
        <h2 id="discard-title" className={hud.modalTitle}>
          {t('hand.discardTitle', { n: need, limit: handLimit(ctx, state, me) })}
        </h2>
        <p className={hud.muted}>{t('hand.discardHint', { chosen: chosen.length, n: need })}</p>
        <div className={styles.choices}>
          {hand.map((c) => (
            <MiniCard
              key={c}
              uid={c}
              id={state.cards.defs[c] ?? ''}
              width={104}
              selected={chosen.includes(c)}
              onClick={() => toggle(c)}
              testid={`limit-discard-${c}`}
            />
          ))}
        </div>
        <div className={hud.modalFoot}>
          <button type="button" className={hud.btn} onClick={close}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={`${hud.btn} ${hud.btnPrimary}`}
            disabled={chosen.length !== need}
            onClick={() => {
              if (!perform({ type: 'discardCards', player: me, cards: chosen })) return;
              close();
              perform({ type: 'endPhase', player: me });
            }}
            data-testid="discard-confirm"
          >
            {t('hand.discardConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
