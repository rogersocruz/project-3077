/**
 * Galeria de cartas (rota de desenvolvimento `?view=cards`): capturas de tela das
 * categorias lado a lado (critério de aceite da Fase 4) e conferência da textura 3D.
 * Parâmetros: `set=ref|all|backs`, `width=<px>`, `blocked=1`, `raster=1`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../card/Card';
import { CARD_H, CARD_W } from '../card/geometry';
import { type BackKind, CardBack } from '../card/CardBack';
import { allCardFaces, cardFace, cardVersion } from '../card/faces';
import type { CardFace } from '../card/model';
import { rasterize } from '../card/rasterize';
import styles from './CardGallery.module.css';

/** As 4 cartas físicas da v0.3 (ART_DIRECTION, referência visual) + uma Relíquia. */
const REFERENCE_CARDS = [
  'tech_orbital_logistics',
  'ion_bomb',
  'strategic_retreat',
  'tpl_preferential_tariff',
  'relic_nav_core',
] as const;

const BACKS: BackKind[] = ['n1', 'n2', 'n3', 'treasure', 'event'];

function Rasterized({ face, width, version }: { face: CardFace; width: number; version: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let alive = true;
    const h = Math.round((width * CARD_H) / CARD_W);
    void rasterize(<Card face={face} width={width} version={version} />, width, h).then((canvas) => {
      if (!alive || !ref.current) return;
      ref.current.replaceChildren(canvas);
      setDone(true);
    });
    return () => {
      alive = false;
    };
  }, [face, width, version]);
  return <div ref={ref} className={styles.raster} data-raster={done ? 'ready' : 'pending'} />;
}

export function CardGallery() {
  const { t } = useTranslation();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const set = params.get('set') ?? 'ref';
  const width = Number(params.get('width') ?? 300) || 300;
  const blocked = params.get('blocked') === '1';
  const raster = params.get('raster') === '1';
  const version = cardVersion();
  const faces = set === 'all' ? allCardFaces() : REFERENCE_CARDS.map(cardFace);

  return (
    <main className={styles.screen} data-testid="card-gallery">
      <h1 className={styles.title}>{t('cards.gallery.title')}</h1>
      <div className={styles.grid}>
        {set === 'backs'
          ? BACKS.map((kind) => (
              <figure key={kind} className={styles.item}>
                <CardBack kind={kind} width={kind === 'event' ? (width * CARD_H) / CARD_W : width} />
                <figcaption className={styles.caption}>{kind}</figcaption>
              </figure>
            ))
          : faces.map((face) => (
              <figure key={face.id} className={styles.item} data-card={face.id}>
                <div className={styles.pair}>
                  <Card face={face} width={width} version={version} blocked={blocked} />
                  {raster && <Rasterized face={face} width={width} version={version} />}
                </div>
                <figcaption className={styles.caption}>{face.id}</figcaption>
              </figure>
            ))}
      </div>
    </main>
  );
}
