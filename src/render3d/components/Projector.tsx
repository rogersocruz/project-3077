/** Registra a projeção mundo → tela da câmera atual (render3d/projector.ts). */
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Vector3 } from 'three';
import { TILE_TOP_Y, TRAY } from '../constants';
import type { TableLayout } from '../layout';
import type { SceneHex, ScenePlayer } from '../model';
import { setProjector } from '../projector';
import { cardAnchorPoint } from '../cardAnchors';

export function Projector({
  layout,
  hexes,
  players,
}: {
  layout: TableLayout;
  hexes: readonly SceneHex[];
  players: readonly ScenePlayer[];
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const byKey = new Map(hexes.map((h) => [h.key, h]));
    const v = new Vector3();
    const toScreen = (x: number, y: number, z: number) => {
      v.set(x, y, z).project(camera);
      if (v.z > 1) return null;
      const rect = gl.domElement.getBoundingClientRect();
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
    };
    setProjector((a) => {
      if (a.kind === 'hex') {
        const h = byKey.get(a.key);
        return h ? toScreen(h.world.x, TILE_TOP_Y, h.world.z) : null;
      }
      if (a.kind === 'trayCenter') {
        const pl = players[a.player];
        const t = pl ? layout.boards[pl.boardId]?.tray : undefined;
        return t ? toScreen(t.x, TRAY.height, t.z) : null;
      }
      const p = cardAnchorPoint(a, { layout, players });
      return p ? toScreen(p.p.x, p.p.y, p.p.z) : null;
    });
    return () => setProjector(null);
  }, [camera, gl, layout, hexes, players]);
  return null;
}
