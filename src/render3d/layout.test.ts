import { describe, expect, it } from 'vitest';
import { makeContext } from '../engine/testing';
import { HEX_RADIUS, SQRT3, TRAY } from './constants';
import {
  boardOutline,
  buildTableLayout,
  cameraPosition,
  hexCorner,
  hexToWorld,
  toTrayLocal,
  trayCorners,
} from './layout';

describe('layout da mesa 3D', () => {
  it('hex pointy-top: vizinhos a √3 de distância, vértice no raio', () => {
    const a = hexToWorld({ q: 0, r: 0 });
    for (const n of [
      { q: 1, r: 0 },
      { q: 0, r: 1 },
      { q: -1, r: 1 },
    ]) {
      const b = hexToWorld(n);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(SQRT3 * HEX_RADIUS);
    }
    const top = hexCorner(1);
    expect(top.x).toBeCloseTo(0);
    expect(top.z).toBeCloseTo(HEX_RADIUS);
  });

  it('toTrayLocal desfaz a rotação de trayCorners', () => {
    const t = { x: 3, z: -2, rotationY: 0.7 };
    const [c] = trayCorners(t);
    const l = toTrayLocal(t, c ?? { x: 0, z: 0 });
    expect(l.x).toBeCloseTo(-TRAY.width / 2);
    expect(l.z).toBeCloseTo(-TRAY.depth / 2);
  });

  for (const players of [3, 4, 5, 6]) {
    for (const longMap of [false, true]) {
      it(`${players} jogadores${longMap ? ' (mapa longo)' : ''}: bandejas fora do planeta e sem se tocar`, () => {
        const ctx = makeContext(players, longMap);
        const layout = buildTableLayout(ctx.planet);
        const hexes = ctx.planet.hexes.map((h) => hexToWorld(ctx.planet.toGlobal(h)));
        for (const b of layout.boards) {
          // Nenhum hex dentro da bandeja (com folga de quase um raio de hex).
          for (const p of hexes) {
            const l = toTrayLocal(b.tray, p);
            const inside =
              Math.abs(l.x) < TRAY.width / 2 + HEX_RADIUS * 0.9 &&
              Math.abs(l.z) < TRAY.depth / 2 + HEX_RADIUS * 0.9;
            expect(inside).toBe(false);
          }
          // Bandeja virada para fora: o centro do planeta fica atrás dela (−z local).
          expect(toTrayLocal(b.tray, layout.centroid).z).toBeLessThan(0);
          for (const o of layout.boards) {
            if (o.id === b.id) continue;
            for (const corner of trayCorners(o.tray)) {
              const l = toTrayLocal(b.tray, corner);
              expect(Math.abs(l.x) < TRAY.width / 2 && Math.abs(l.z) < TRAY.depth / 2).toBe(false);
            }
          }
        }
      });
    }
  }

  it('contorno do tabuleiro: 6·(2n − 1) arestas externas de tamanho 1 raio', () => {
    const ctx = makeContext(4);
    const n = ctx.planet.edge;
    const segs = boardOutline(ctx.planet, 0);
    expect(segs).toHaveLength(6 * (2 * n - 1));
    for (const s of segs) expect(Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z)).toBeCloseTo(HEX_RADIUS);
  });

  it('poses de câmera respeitam o pitch de UX_SPEC 4 (25°–80°)', () => {
    const layout = buildTableLayout(makeContext(6).planet);
    for (const pose of [layout.overview, ...layout.boards.map((b) => b.focus)]) {
      const p = cameraPosition(pose);
      const horiz = Math.hypot(p.x - pose.target.x, p.z - pose.target.z);
      const pitch = (Math.atan2(p.y, horiz) * 180) / Math.PI;
      expect(pitch).toBeGreaterThanOrEqual(25);
      expect(pitch).toBeLessThanOrEqual(80);
    }
  });
});
