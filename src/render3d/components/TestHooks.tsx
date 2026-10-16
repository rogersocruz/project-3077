/**
 * Gancho só de desenvolvimento para o Playwright clicar em hexes de verdade no canvas:
 * `window.__p3077.hexToScreen(key)` projeta o centro do topo do tile em coordenadas de
 * tela (pixels da página). Não existe no build de produção.
 */
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Vector3 } from 'three';
import { TILE_TOP_Y } from '../constants';
import type { SceneHex } from '../model';

export interface SceneTestHooks {
  hexToScreen(key: string): { x: number; y: number } | null;
}

declare global {
  interface Window {
    __p3077?: Partial<SceneTestHooks> & Record<string, unknown>;
  }
}

export function TestHooks({ hexes }: { hexes: readonly SceneHex[] }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const byKey = new Map(hexes.map((h) => [h.key, h]));
    const v = new Vector3();
    const hooks: SceneTestHooks = {
      hexToScreen(key) {
        const h = byKey.get(key);
        if (!h) return null;
        v.set(h.world.x, TILE_TOP_Y, h.world.z).project(camera);
        if (v.z > 1) return null;
        const rect = gl.domElement.getBoundingClientRect();
        return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
      },
    };
    window.__p3077 = { ...window.__p3077, ...hooks };
  }, [hexes, camera, gl]);
  return null;
}
