/**
 * Tiles hexagonais instanciados: um InstancedMesh por terreno revelado (topo pintado),
 * um para a névoa (verso metálico) e bisel dourado nos hazards. Faz o raycast:
 * hover destaca, clique seleciona (sceneStore).
 */
import type { ThreeEvent } from '@react-three/fiber';
import { useMemo } from 'react';
import type { Material } from 'three';
import { BOARD_PLATE_HEIGHT } from '../constants';
import { createHexTileGeometry } from '../geometry/hexTile';
import {
  fogMaterial,
  hazardBevelMaterial,
  terrainMaterial,
  tileBevelMaterial,
  tileSideMaterial,
} from '../materials';
import type { SceneHex } from '../model';
import { useSceneStore } from '../sceneStore';
import { useInstanceMatrices } from './instancing';

/** Arrasto maior que isso (px) não conta como clique — foi órbita. */
const CLICK_SLOP = 6;

interface GroupProps {
  hexes: readonly SceneHex[];
  materials: Material[];
  /** Rotação por tabuleiro (só a névoa usa: o "?" fica de frente para o dono). */
  facing?: readonly number[];
}

/** Gira em múltiplos de 60°: o hex continua encaixado na grade. */
const snap60 = (a: number) => Math.round(a / (Math.PI / 3)) * (Math.PI / 3);

function TileGroup({ hexes, materials, facing }: GroupProps) {
  const geometry = useMemo(() => createHexTileGeometry(), []);
  const list = useMemo(
    () =>
      hexes.map((h) => ({
        x: h.world.x,
        y: BOARD_PLATE_HEIGHT,
        z: h.world.z,
        rotY: facing ? snap60(facing[h.boardId] ?? 0) : 0,
      })),
    [hexes, facing],
  );
  const ref = useInstanceMatrices(list);
  const setHovered = useSceneStore((s) => s.setHovered);
  const select = useSceneStore((s) => s.select);

  const keyOf = (e: ThreeEvent<PointerEvent | MouseEvent>) =>
    e.instanceId === undefined ? null : (hexes[e.instanceId]?.key ?? null);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, materials, hexes.length]}
      castShadow
      receiveShadow
      onPointerMove={(e) => {
        e.stopPropagation();
        setHovered(keyOf(e));
      }}
      onPointerOut={() => setHovered(null)}
      onClick={(e) => {
        if (e.delta > CLICK_SLOP) return;
        e.stopPropagation();
        select(keyOf(e));
      }}
    />
  );
}

interface HexTilesProps {
  hexes: readonly SceneHex[];
  textureSize: number;
  facing: readonly number[];
}

export function HexTiles({ hexes, textureSize, facing }: HexTilesProps) {
  const groups = useMemo(() => {
    const byTerrain = new Map<string, SceneHex[]>();
    const fog: SceneHex[] = [];
    for (const h of hexes) {
      if (!h.revealed) {
        fog.push(h);
        continue;
      }
      const list = byTerrain.get(h.terrain) ?? [];
      list.push(h);
      byTerrain.set(h.terrain, list);
    }
    // Arrays de material montados uma vez: um array novo a cada render faria o React
    // Three Fiber recriar o InstancedMesh (args mudou).
    const tiles = [...byTerrain.entries()].map(([terrain, list]) => ({
      terrain,
      list,
      materials: [
        terrainMaterial(terrain, textureSize),
        list[0]?.kind === 'hazard' ? hazardBevelMaterial() : tileBevelMaterial(),
        tileSideMaterial(),
      ],
    }));
    const fogMaterials = [fogMaterial(textureSize), tileBevelMaterial(), tileSideMaterial()];
    return { tiles, fog, fogMaterials };
  }, [hexes, textureSize]);

  return (
    <group>
      {groups.tiles.map(({ terrain, list, materials }) => (
        <TileGroup key={`${terrain}:${list.length}`} hexes={list} materials={materials} />
      ))}
      {groups.fog.length > 0 && (
        <TileGroup
          key={`fog:${groups.fog.length}`}
          hexes={groups.fog}
          facing={facing}
          materials={groups.fogMaterials}
        />
      )}
    </group>
  );
}
