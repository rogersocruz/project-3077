/**
 * Barra do topo (UX_SPEC 2.5): rodada, as 7 fases do turno com a atual em destaque,
 * de quem é a vez, velocidade de animação e os botões de ajustes, regras e pausa.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePresentation } from '../../anim';
import { TURN_PHASES } from '../../engine';
import { seatFaction } from '../../render3d/model';
import { ANIMATION_SPEEDS, type AnimationSpeed, type Quality, useSettings } from '../../settings';
import { FactionBadge, Icon } from '../components/Bits';
import eventStyles from '../event/Event.module.css';
import { EventCard } from '../event/EventCard';
import { useSession } from '../game/session';
import { playerName } from '../game/text';
import { useUi } from '../game/uiStore';
import styles from './Game.module.css';
import hud from './Hud.module.css';

const SPEED_KEY: Record<string, string> = {
  '0.5': 'hud.speedHalf',
  '1': 'hud.speedNormal',
  '2': 'hud.speedDouble',
  instant: 'hud.speedInstant',
};
const QUALITIES: Quality[] = ['low', 'medium', 'high'];

function QuickSettings({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const gameplay = useSettings((s) => s.gameplay);
  const render = useSettings((s) => s.render);
  const setGameplay = useSettings((s) => s.setGameplay);
  const setRender = useSettings((s) => s.setRender);
  const setPost = useSettings((s) => s.setPost);
  const postOn = render.post.bloom || render.post.vignette || render.post.smaa || render.post.tiltShift;
  const toggles = [
    {
      key: 'hud.optPrivacy',
      on: gameplay.privacyScreen,
      set: (v: boolean) => setGameplay({ privacyScreen: v }),
    },
    { key: 'hud.optUndo', on: gameplay.undo, set: (v: boolean) => setGameplay({ undo: v }) },
    { key: 'table.shadows', on: render.shadows, set: (v: boolean) => setRender({ shadows: v }) },
    {
      key: 'hud.optPost',
      on: postOn,
      set: (v: boolean) => setPost({ bloom: v, vignette: v, smaa: v, tiltShift: v }),
    },
    {
      key: 'table.adaptive',
      on: render.adaptiveQuality,
      set: (v: boolean) => setRender({ adaptiveQuality: v }),
    },
  ];
  return (
    <div className={`${hud.plate} ${styles.popover}`} role="dialog" aria-label={t('hud.settings')}>
      <div className={styles.popHead}>
        <h2 className={hud.plateTitle}>{t('hud.settings')}</h2>
        <button
          type="button"
          className={`${hud.btn} ${hud.btnIcon}`}
          onClick={onClose}
          aria-label={t('common.close')}
        >
          <Icon glyph="close" size={14} />
        </button>
      </div>
      <label className={styles.popRow}>
        <span>{t('table.quality')}</span>
        <select value={render.quality} onChange={(e) => setRender({ quality: e.target.value as Quality })}>
          {QUALITIES.map((q) => (
            <option key={q} value={q}>
              {t(`table.quality${q[0]?.toUpperCase()}${q.slice(1)}`)}
            </option>
          ))}
        </select>
      </label>
      {toggles.map((tg) => (
        <label key={tg.key} className={styles.popRow}>
          <span>{t(tg.key)}</span>
          <input type="checkbox" checked={tg.on} onChange={(e) => tg.set(e.target.checked)} />
        </label>
      ))}
    </div>
  );
}

export function TopBar() {
  const { t } = useTranslation();
  const turn = usePresentation((s) => s.turn);
  // Evento da rodada no topo (UX_SPEC 2.5): aparece quando a cinemática termina.
  const shownEvent = usePresentation((s) => (s.eventReveal ? null : (s.shown?.world.current ?? null)));
  const ctx = useSession((s) => s.ctx);
  const speed = useSettings((s) => s.gameplay.animationSpeed);
  const setGameplay = useSettings((s) => s.setGameplay);
  const open = useUi((s) => s.open);
  const [settingsOpen, setSettingsOpen] = useState(false);
  if (!turn || !ctx) return null;
  const playing = turn.stage !== 'setup';
  const current = TURN_PHASES.indexOf(turn.phase);

  return (
    <header className={styles.top}>
      <div className={`${hud.plate} ${hud.rivets} ${styles.roundPlate}`} data-testid="round">
        {playing ? (
          <>
            <span className={hud.label}>{t('hud.roundLabel')}</span>
            <span className={`${hud.num} ${styles.roundNum}`}>{turn.round}</span>
            <span className={`${hud.num} ${styles.roundOf}`}>/{ctx.balance.turn.roundLimit}</span>
          </>
        ) : (
          <span className={styles.setupLabel}>{t('hud.setup')}</span>
        )}
      </div>

      <ol className={`${hud.plate} ${styles.phases}`} aria-label={t('hud.phases')}>
        {TURN_PHASES.map((phase, i) => {
          const state = !playing ? '' : i === current ? styles.phaseOn : i < current ? styles.phaseDone : '';
          return (
            <li
              key={phase}
              className={`${styles.phase} ${state}`}
              aria-current={playing && i === current ? 'step' : undefined}
            >
              <span className={`${hud.num} ${styles.phaseNum}`}>{i + 1}</span>
              <span className={styles.phaseName}>{t(`phases.${phase}`)}</span>
            </li>
          );
        })}
      </ol>

      {shownEvent && (
        <button
          type="button"
          className={eventStyles.chip}
          onClick={() => open({ kind: 'event' })}
          title={t('events.round')}
          data-testid="event-chip"
        >
          <EventCard id={shownEvent} size="mini" />
        </button>
      )}

      <div className={`${hud.plate} ${styles.turnOf}`} data-testid="turn-of">
        <FactionBadge faction={seatFaction(turn.activePlayer)} size={18} />
        <span>{t('hud.turnOf', { name: playerName(t, turn.activePlayer) })}</span>
      </div>

      <div className={`${hud.plate} ${styles.speed}`} role="radiogroup" aria-label={t('hud.speed')}>
        {ANIMATION_SPEEDS.map((s: AnimationSpeed) => (
          <button
            key={String(s)}
            type="button"
            role="radio"
            aria-checked={speed === s}
            className={`${styles.speedBtn} ${speed === s ? styles.speedOn : ''}`}
            onClick={() => setGameplay({ animationSpeed: s })}
            title={t(SPEED_KEY[String(s)] ?? 'hud.speed')}
          >
            {s === 'instant' ? t('hud.speedInstantShort') : `${s}×`}
          </button>
        ))}
      </div>

      <div className={styles.topButtons}>
        <button
          type="button"
          className={`${hud.btn} ${hud.btnIcon} ${settingsOpen ? hud.btnOn : ''}`}
          onClick={() => setSettingsOpen((v) => !v)}
          aria-label={t('hud.settings')}
          title={t('hud.settings')}
        >
          <Icon glyph="gear" />
        </button>
        <button
          type="button"
          className={`${hud.btn} ${hud.btnIcon}`}
          onClick={() => open({ kind: 'rules' })}
          aria-label={t('rules.title')}
          title={`${t('rules.title')} (F1)`}
        >
          <Icon glyph="help" />
        </button>
        <button
          type="button"
          className={`${hud.btn} ${hud.btnIcon}`}
          onClick={() => open({ kind: 'pause' })}
          aria-label={t('pause.title')}
          title={`${t('pause.title')} (Esc)`}
        >
          <Icon glyph="pause" />
        </button>
      </div>
      {settingsOpen && <QuickSettings onClose={() => setSettingsOpen(false)} />}
    </header>
  );
}
