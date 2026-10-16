/**
 * Bandejas dos jogadores (ART_DIRECTION 6), à frente de cada tabuleiro e viradas para
 * ele: emblema da facção, estoque em pilhas físicas de tokens, 5 slots de permanentes
 * e as trilhas de vitória (só o espaço gravado até a Fase 9).
 * Coordenadas locais da bandeja: x ao longo dela, +z para o jogador.
 *
 * Desempenho: cada elemento é instanciado para todas as bandejas de uma vez
 * (~15 draw calls para a mesa toda).
 */
import { useMemo } from 'react';
import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  type Material,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RESOURCE_IDS } from '../../data/schemas';
import { Rng } from '../../engine/rng';
import { type CardCategoryKey, palette } from '../../ui/theme/tokens';
import { CARD, TOKEN, TRAY } from '../constants';
import { box, merge } from '../geometry/primitives';
import { symbolGeometry, tokenGeometry } from '../geometry/pieces';
import type { TrayPlacement } from '../layout';
import {
  cardFaceMaterial,
  envelopeMaterial,
  instancedAccentMaterial,
  sealMaterial,
  slotMaterial,
  structureMaterial,
  tokenMaterial,
  trayEdgeMaterial,
  trayMaterial,
} from '../materials';
import { type ScenePlayer, tokenColumns } from '../model';
import { ENVELOPE, TRAY_LAYOUT as L } from '../trayLayout';
import { useInstanceBatch } from './instancing';

const TOP = TRAY.height;

/** Detalhes gravados fixos da bandeja: slots de permanentes e sulcos das trilhas. */
function engravingGeometry(slots: number): BufferGeometry {
  const parts = Array.from({ length: slots }, (_, i) =>
    box(CARD.width + 0.08, 0.006, CARD.height + 0.08, { x: L.slotX0 + i * L.slotStep, y: TOP, z: L.slotZ }),
  );
  for (const z of L.trackZ)
    parts.push(box(L.trackLength, 0.006, 0.1, { x: L.trackX0 + L.trackLength / 2, y: TOP, z }));
  return merge(parts);
}

/** Partes metálicas: pedestal do emblema e marcas das trilhas. */
function metalGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [
    new CylinderGeometry(0.34, 0.37, 0.05, 24).translate(L.emblemX, TOP + 0.025, 0),
  ];
  for (const z of L.trackZ) {
    for (let i = 1; i < 10; i++)
      parts.push(box(0.012, 0.008, 0.1, { x: L.trackX0 + (i * L.trackLength) / 10, y: TOP, z }));
  }
  return merge(parts);
}

interface Item {
  matrix: Matrix4;
  color?: string;
}
interface Batch {
  geometry: BufferGeometry;
  material: Material | Material[];
  items: Item[];
  castShadow: boolean;
}

const UP = new Vector3(0, 1, 0);
const local = (x: number, y: number, z: number, rotY = 0) =>
  new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromAxisAngle(UP, rotY),
    new Vector3(1, 1, 1),
  );

function buildBatches(
  players: readonly ScenePlayer[],
  placements: readonly (TrayPlacement | undefined)[],
  slots: number,
) {
  const batches = new Map<string, Batch>();
  const add = (key: string, make: () => Omit<Batch, 'items'>, item: Item) => {
    let b = batches.get(key);
    if (!b) {
      b = { ...make(), items: [] };
      batches.set(key, b);
    }
    b.items.push(item);
  };
  const shared = {
    base: new RoundedBoxGeometry(TRAY.width, TRAY.height, TRAY.depth, 2, 0.06).translate(
      0,
      TRAY.height / 2,
      0,
    ),
    stripe: new BoxGeometry(TRAY.width - 0.2, 0.008, 0.06).translate(0, TOP + 0.004, L.stripeZ),
    engraving: engravingGeometry(slots),
    metal: metalGeometry(),
    card: new BoxGeometry(CARD.width, CARD.thickness, CARD.height).translate(
      0,
      TOP + 0.006 + CARD.thickness / 2,
      0,
    ),
    envelope: new BoxGeometry(ENVELOPE.width, ENVELOPE.height, ENVELOPE.depth).translate(
      0,
      TOP + 0.004 + ENVELOPE.height / 2,
      0,
    ),
    seal: new CylinderGeometry(0.06, 0.06, 0.012, 16).translate(0, TOP + 0.004 + ENVELOPE.height + 0.006, 0),
  };

  players.forEach((p, idx) => {
    const t = placements[idx];
    if (!t) return;
    const tray = local(t.x, 0, t.z, t.rotationY);
    const at = (m: Matrix4) => tray.clone().multiply(m);
    const color = palette.faction[p.faction].color;

    add('base', () => ({ geometry: shared.base, material: trayMaterial(), castShadow: true }), {
      matrix: tray,
    });
    add(
      'stripe',
      () => ({ geometry: shared.stripe, material: instancedAccentMaterial(), castShadow: false }),
      {
        matrix: tray,
        color,
      },
    );
    add('engraving', () => ({ geometry: shared.engraving, material: slotMaterial(), castShadow: false }), {
      matrix: tray,
    });
    add('metal', () => ({ geometry: shared.metal, material: trayEdgeMaterial(), castShadow: true }), {
      matrix: tray,
    });

    const symbol = palette.faction[p.faction].symbol;
    add(
      `emblem:${symbol}`,
      () => ({
        geometry: symbolGeometry(symbol, 0.22, 0.06),
        material: instancedAccentMaterial(),
        castShadow: true,
      }),
      { matrix: at(local(L.emblemX, TOP + 0.08, 0)), color },
    );

    // Pilhas "de verdade": cada token levemente fora de esquadro. Uma sequência por
    // recurso: a pilha que cresce não remexe as outras.
    RESOURCE_IDS.forEach((id, i) => {
      const rng = Rng.fromSeed(`tokens:${p.id}:${id}`);
      tokenColumns(p.resources[id], TOKEN.perColumn, TOKEN.maxColumns).forEach((n, c) => {
        for (let k = 0; k < n; k++) {
          const m = local(
            L.tokenX0 + i * L.tokenStep + (rng.next() - 0.5) * 0.014,
            TOP + k * TOKEN.thickness,
            L.tokenZ0 + c * L.tokenColStep + (rng.next() - 0.5) * 0.014,
            (rng.next() - 0.5) * 0.5,
          );
          add(
            `token:${id}`,
            () => ({
              geometry: tokenGeometry(palette.resource[id].shape),
              material: tokenMaterial(id),
              castShadow: true,
            }),
            { matrix: at(m) },
          );
        }
      });
    });

    p.permanents.forEach((perm, i) => {
      if (!perm) return;
      const category: CardCategoryKey = perm.category;
      const side = structureMaterial('dark');
      add(
        `card:${perm.id}`,
        () => ({
          geometry: shared.card,
          // Face só no topo (+y); bordas escuras.
          material: [side, side, cardFaceMaterial(perm.id, category), side, side, side],
          castShadow: true,
        }),
        { matrix: at(local(L.slotX0 + i * L.slotStep, 0, L.slotZ)) },
      );
    });

    // Cartas entregues esperando a Revelação: um envelope lacrado por carta (Fase 4).
    for (let i = 0; i < (p.incoming ?? 0); i++) {
      const m = at(local(L.slotX0 + i * ENVELOPE.step, 0, ENVELOPE.z, (i % 2 ? 1 : -1) * 0.06));
      add('envelope', () => ({ geometry: shared.envelope, material: envelopeMaterial(), castShadow: true }), {
        matrix: m,
      });
      add('envelope:seal', () => ({ geometry: shared.seal, material: sealMaterial(), castShadow: false }), {
        matrix: m,
      });
    }
  });
  return [...batches.entries()];
}

function BatchMesh({ batch }: { batch: Batch }) {
  const ref = useInstanceBatch(batch.items);
  return (
    <instancedMesh
      ref={ref}
      args={[batch.geometry, batch.material, batch.items.length]}
      castShadow={batch.castShadow}
      receiveShadow
    />
  );
}

export function Trays({
  players,
  placements,
}: {
  players: readonly ScenePlayer[];
  placements: readonly (TrayPlacement | undefined)[];
}) {
  const slots = players[0]?.permanents.length ?? 0;
  const batches = useMemo(() => buildBatches(players, placements, slots), [players, placements, slots]);
  return (
    <group>
      {batches.map(([key, b]) => (
        <BatchMesh key={`${key}:${b.items.length}`} batch={b} />
      ))}
    </group>
  );
}
