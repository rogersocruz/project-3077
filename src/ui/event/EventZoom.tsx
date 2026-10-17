/** Zoom da carta do evento da rodada (clique no topo do HUD). */
import { useTranslation } from 'react-i18next';
import { usePresentation } from '../../anim';
import { useUi } from '../game/uiStore';
import hud from '../hud/Hud.module.css';
import styles from './Event.module.css';
import { EventCard } from './EventCard';

export function EventZoom() {
  const { t } = useTranslation();
  const modal = useUi((s) => s.modal);
  const id = usePresentation((s) => s.shown?.world.current ?? null);
  if (modal?.kind !== 'event' || !id) return null;
  const close = () => useUi.getState().open(null);
  return (
    <div className={styles.zoomBackdrop} role="dialog" aria-label={t('events.round')} onClick={close}>
      <div onClick={(e) => e.stopPropagation()}>
        <EventCard id={id} size="large" />
        <button type="button" className={hud.btn} onClick={close} style={{ marginTop: 12 }}>
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
