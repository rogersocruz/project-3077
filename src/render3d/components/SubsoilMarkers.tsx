/**
 * Subsolo sondado (GDD 4.2, ART_DIRECTION 5 "fatia de corte geológico"): uma amostra
 * — pedestal escuro com o token do recurso — na ponta do hex voltada para o dono.
 * Só aparece para quem sondou (o modelo já vem filtrado por quem olha). Vazio ou
 * esgotado: só o pedestal.
 */
import { useMemo } from 'react';
import { type BufferGeometry, CylinderGeometry, type Material, Matrix4, Quaternion, Vector3 } from 'three';
import { RESOURCE_IDS, type ResourceId } from '../../data/schemas';
import { palette } from '../../ui/theme/tokens';
import { TILE_TOP_Y } from '../constants';
import { tokenGeometry } from '../geometry/pieces';
import { slotMaterial, structureMaterial, tokenMaterial } from '../materials';
import type { SceneHex } from '../model';
import { type MatrixBatchItem, useInstanceBatch } from './instancing';

const UP = new Vector3(0, 1, 0);
const plinthGeo = new CylinderGeometry(0.15, 0.17, 0.035, 20).translate(0, 0.0175, 0);
const ringGeo = new CylinderGeometry(0.175, 0.175, 0.012, 20, 1, true).translate(0, 0.03, 0);
/** Ponta do hex voltada para o dono (o tile é pointy-top: vértice em +z local). */
const OFFSET = 0.64;
const TOKEN_SCALE = 0.62;

interface BatchProps {
  items: MatrixBatchItem[];
  geometry: BufferGeometry;
  material: Material;
}

function Batch({ items, geometry, material }: BatchProps) {
  const ref = useInstanceBatch(items);
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow receiveShadow />;
}

export function SubsoilMarkers({ hexes, facing }: { hexes: readonly SceneHex[]; facing: readonly number[] }) {
  const batches = useMemo(() => {
    const plinths: MatrixBatchItem[] = [];
    const tokens = new Map<ResourceId, MatrixBatchItem[]>();
    for (const h of hexes) {
      if (!h.subsoil) continue;
      const rot = new Quaternion().setFromAxisAngle(UP, facing[h.boardId] ?? 0);
      const at = new Vector3(0, 0, OFFSET)
        .applyQuaternion(rot)
        .add(new Vector3(h.world.x, TILE_TOP_Y, h.world.z));
      plinths.push({ matrix: new Matrix4().compose(at, rot, new Vector3(1, 1, 1)) });
      const res = h.subsoil.resource;
      if (!res || h.subsoil.depleted) continue;
      const list = tokens.get(res) ?? [];
      list.push({
        matrix: new Matrix4().compose(
          at.clone().setY(TILE_TOP_Y + 0.035),
          rot,
          new Vector3(TOKEN_SCALE, TOKEN_SCALE, TOKEN_SCALE),
        ),
      });
      tokens.set(res, list);
    }
    return {
      plinths,
      tokens: RESOURCE_IDS.flatMap((id) => (tokens.has(id) ? [[id, tokens.get(id) ?? []] as const] : [])),
    };
  }, [hexes, facing]);

  if (batches.plinths.length === 0) return null;
  return (
    <group>
      <Batch
        key={`plinth:${batches.plinths.length}`}
        items={batches.plinths}
        geometry={plinthGeo}
        material={slotMaterial()}
      />
      <Batch
        key={`rim:${batches.plinths.length}`}
        items={batches.plinths}
        geometry={ringGeo}
        material={structureMaterial('metal')}
      />
      {batches.tokens.map(([id, items]) => (
        <Batch
          key={`${id}:${items.length}`}
          items={items}
          geometry={tokenGeometry(palette.resource[id].shape)}
          material={tokenMaterial(id)}
        />
      ))}
    </group>
  );
}
