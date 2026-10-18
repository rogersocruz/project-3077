/** Vitrine 3D na Coleção: a mesa montada (vitrine da Fase 2) com 3–6 jogadores e órbita livre. */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildShowcase } from '../../render3d/dev/showcase';
import { useSceneStore } from '../../render3d/sceneStore';
import { TableScene } from '../../render3d/TableScene';
import hud from '../hud/Hud.module.css';
import styles from '../screens/Collection.module.css';

export function Showcase() {
  const { t } = useTranslation();
  const [players, setPlayers] = useState(4);
  const [orbit, setOrbit] = useState(true);
  const showcase = useMemo(() => buildShowcase(players, 7), [players]);
  useEffect(() => {
    useSceneStore.getState().requestFocus({ kind: 'overview' }, true);
  }, [players]);
  useEffect(() => {
    useSceneStore.getState().setOrbit(orbit);
    return () => useSceneStore.getState().setOrbit(false);
  }, [orbit]);
  return (
    <div className={styles.showcase} data-testid="col-showcase">
      <div className={styles.row}>
        {[3, 4, 5, 6].map((n) => (
          <button
            key={n}
            type="button"
            className={`${hud.btn} ${players === n ? hud.btnOn : ''}`}
            onClick={() => setPlayers(n)}
          >
            {t('collection.playersN', { n })}
          </button>
        ))}
        <label className={styles.note}>
          <input type="checkbox" checked={orbit} onChange={(e) => setOrbit(e.target.checked)} />{' '}
          {t('collection.orbit')}
        </label>
        <span className={styles.note}>{t('collection.showcaseHint')}</span>
      </div>
      <div className={styles.stage}>
        <TableScene key={players} planet={showcase.ctx.planet} model={showcase.model} />
      </div>
    </div>
  );
}
