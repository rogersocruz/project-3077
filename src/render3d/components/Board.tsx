/**
 * Base dos tabuleiros: placa escura sob cada hex (aparece nas folgas entre tiles) e a
 * faixa na cor do dono em volta de cada tabuleiro.
 */
import { useMemo } from 'react';
import { BoxGeometry, CylinderGeometry } from 'three';
import type { Planet } from '../../engine/hex';
import { BOARD_PLATE_HEIGHT, HEX_RADIUS } from '../constants';
import { accentMaterial, boardPlateMaterial } from '../materials';
import { boardOutline } from '../layout';
import type { SceneHex, ScenePlayer } from '../model';
import { useInstanceMatrices } from './instancing';

function Plates({ hexes }: { hexes: readonly SceneHex[] }) {
  const geometry = useMemo(() => {
    const g = new CylinderGeometry(HEX_RADIUS, HEX_RADIUS, BOARD_PLATE_HEIGHT, 6);
    g.translate(0, BOARD_PLATE_HEIGHT / 2, 0);
    return g;
  }, []);
  const list = useMemo(() => hexes.map((h) => ({ x: h.world.x, y: 0, z: h.world.z })), [hexes]);
  const ref = useInstanceMatrices(list);
  return <instancedMesh ref={ref} args={[geometry, boardPlateMaterial(), list.length]} receiveShadow />;
}

const STRIP = { width: 0.07, height: 0.035 };

function Outline({
  planet,
  boardId,
  faction,
}: {
  planet: Planet;
  boardId: number;
  faction: ScenePlayer['faction'];
}) {
  const geometry = useMemo(() => {
    const g = new BoxGeometry(1, STRIP.height, STRIP.width);
    g.translate(0, STRIP.height / 2, 0);
    return g;
  }, []);
  const list = useMemo(
    () =>
      boardOutline(planet, boardId).map((s) => {
        const dx = s.b.x - s.a.x;
        const dz = s.b.z - s.a.z;
        return {
          // Recuada meia largura para dentro: tabuleiros vizinhos não disputam a aresta.
          x: (s.a.x + s.b.x) / 2 + (s.inward.x * STRIP.width) / 2,
          y: BOARD_PLATE_HEIGHT,
          z: (s.a.z + s.b.z) / 2 + (s.inward.z * STRIP.width) / 2,
          rotY: -Math.atan2(dz, dx),
          // Sobra pequena para fechar os cantos.
          sx: Math.hypot(dx, dz) + STRIP.width * 0.6,
          sy: 1,
          sz: 1,
        };
      }),
    [planet, boardId],
  );
  const ref = useInstanceMatrices(list);
  return <instancedMesh ref={ref} args={[geometry, accentMaterial(faction), list.length]} castShadow />;
}

export function Boards({
  planet,
  hexes,
  players,
}: {
  planet: Planet;
  hexes: readonly SceneHex[];
  players: readonly ScenePlayer[];
}) {
  return (
    <group>
      <Plates hexes={hexes} />
      {players.map((p) => (
        <Outline key={p.id} planet={planet} boardId={p.boardId} faction={p.faction} />
      ))}
    </group>
  );
}
