/**
 * Tela de desenvolvimento da mesa 3D (Fase 2): vitrine montada pelo motor + painel com
 * FPS, hex sob o mouse/selecionado e interruptores de qualidade e pós-processamento.
 * Vira a tela de partida na Fase 3.
 */
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { buildShowcase } from '../../render3d/dev/showcase';
import type { SceneHex } from '../../render3d/model';
import { useSceneStore } from '../../render3d/sceneStore';
import { TableScene } from '../../render3d/TableScene';
import { type Quality, useSettings } from '../../settings';
import styles from './TableView.module.css';
import { parseTableParams } from './tableParams';

function HexLine({ label, hex }: { label: string; hex: SceneHex | undefined }) {
  const { t } = useTranslation();
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span>
        {hex
          ? t('table.hexInfo', {
              board: hex.boardId + 1,
              q: hex.q,
              r: hex.r,
              terrain: hex.revealed ? t(`terrain.${hex.terrain}`) : t('table.hidden'),
            })
          : t('table.none')}
      </span>
    </div>
  );
}

const QUALITIES: Quality[] = ['low', 'medium', 'high', 'ultra'];
const QUALITY_KEY: Record<Quality, string> = {
  low: 'table.qualityLow',
  medium: 'table.qualityMedium',
  high: 'table.qualityHigh',
  ultra: 'table.qualityUltra',
};

function DevPanel({ hexes }: { hexes: readonly SceneHex[] }) {
  const { t } = useTranslation();
  const byKey = useMemo(() => new Map(hexes.map((h) => [h.key, h])), [hexes]);
  const fps = useSceneStore((s) => s.fps);
  const autoTier = useSceneStore((s) => s.autoTier);
  const hovered = useSceneStore((s) => s.hovered);
  const selected = useSceneStore((s) => s.selected);
  const render = useSettings((s) => s.render);
  const setRender = useSettings((s) => s.setRender);
  const setPost = useSettings((s) => s.setPost);

  const toggles: { key: string; on: boolean; set: (v: boolean) => void }[] = [
    { key: 'table.shadows', on: render.shadows, set: (v) => setRender({ shadows: v }) },
    { key: 'table.props', on: render.props, set: (v) => setRender({ props: v }) },
    { key: 'table.adaptive', on: render.adaptiveQuality, set: (v) => setRender({ adaptiveQuality: v }) },
    { key: 'table.bloom', on: render.post.bloom, set: (v) => setPost({ bloom: v }) },
    { key: 'table.vignette', on: render.post.vignette, set: (v) => setPost({ vignette: v }) },
    { key: 'table.tiltShift', on: render.post.tiltShift, set: (v) => setPost({ tiltShift: v }) },
    { key: 'table.smaa', on: render.post.smaa, set: (v) => setPost({ smaa: v }) },
  ];

  return (
    <aside className={styles.panel}>
      <header className={styles.head}>
        <h1 className={styles.title}>{t('table.devTitle')}</h1>
        <span className={styles.fps} data-testid="fps">
          {t('table.fps', { fps })}
        </span>
      </header>
      <HexLine label={t('table.hovered')} hex={hovered ? byKey.get(hovered) : undefined} />
      <HexLine label={t('table.selected')} hex={selected ? byKey.get(selected) : undefined} />
      <label className={styles.row}>
        <span className={styles.label}>{t('table.quality')}</span>
        <select value={render.quality} onChange={(e) => setRender({ quality: e.target.value as Quality })}>
          {QUALITIES.map((q) => (
            <option key={q} value={q}>
              {t(QUALITY_KEY[q])}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.toggles}>
        {toggles.map((tg) => (
          <label key={tg.key} className={styles.toggle}>
            <input type="checkbox" checked={tg.on} onChange={(e) => tg.set(e.target.checked)} />
            {t(tg.key)}
          </label>
        ))}
      </div>
      {render.adaptiveQuality && <p className={styles.hint}>{t('table.autoTier', { tier: autoTier })}</p>}
      <p className={styles.hint}>{t('table.hint')}</p>
    </aside>
  );
}

export function TableView() {
  const { t } = useTranslation();
  const params = useMemo(() => parseTableParams(window.location.search), []);
  const showcase = useMemo(() => buildShowcase(params.players, params.seed), [params]);
  const requestFocus = useSceneStore((s) => s.requestFocus);
  const setRender = useSettings((s) => s.setRender);
  const setPost = useSettings((s) => s.setPost);

  // Parâmetros da URL valem para esta visita (capturas de tela reproduzíveis).
  useEffect(() => {
    if (params.quality) setRender({ quality: params.quality });
    if (params.adaptive !== null) setRender({ adaptiveQuality: params.adaptive });
    if (params.post !== null) {
      const v = params.post;
      setPost({ bloom: v, vignette: v, smaa: v, tiltShift: v });
    }
    requestFocus(params.cam ?? { kind: 'overview' }, true);
  }, [params, requestFocus, setRender, setPost]);

  return (
    <main className={styles.screen}>
      <div className={styles.canvas} role="img" aria-label={t('table.canvasLabel')}>
        <TableScene planet={showcase.ctx.planet} model={showcase.model} />
      </div>
      {params.showUi && <DevPanel hexes={showcase.model.hexes} />}
    </main>
  );
}
