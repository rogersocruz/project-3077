/**
 * Fundo do menu principal (UX_SPEC 2.2): roseta montada (vitrine da Fase 2) com a câmera em
 * órbita lenta; com movimento reduzido, a câmera fica parada.
 */
import { useEffect, useMemo } from 'react';
import { buildShowcase } from '../../render3d/dev/showcase';
import { useSceneStore } from '../../render3d/sceneStore';
import { TableScene } from '../../render3d/TableScene';
import { prefersReducedMotion } from '../../settings';
import styles from './Home.module.css';

export function MenuBackdrop() {
  const showcase = useMemo(() => buildShowcase(4, 7), []);
  useEffect(() => {
    useSceneStore.getState().requestFocus({ kind: 'overview' }, true);
    useSceneStore.getState().setOrbit(!prefersReducedMotion());
    return () => useSceneStore.getState().setOrbit(false);
  }, []);
  return (
    <div className={styles.backdrop} aria-hidden="true" data-testid="menu-backdrop">
      <TableScene planet={showcase.ctx.planet} model={showcase.model} />
    </div>
  );
}
