/**
 * Posições de mundo: hex axial → (x, z), bandeja de cada jogador e enquadramentos
 * de câmera. Puro (sem three), testado no Vitest.
 *
 * Hex com topo "pointy": vértices apontam para ±z. O eixo y é a altura.
 */
import { type Axial, DIRECTIONS, type Planet } from '../engine/hex';
import { CAMERA, HEX_RADIUS, SQRT3, TRAY } from './constants';

export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export function hexToWorld(h: Axial, size = HEX_RADIUS): Vec2 {
  return { x: size * SQRT3 * (h.q + h.r / 2), z: size * 1.5 * h.r };
}

/** Vértice i (0–5) de um hex pointy-top de raio `size` centrado na origem. */
export function hexCorner(i: number, size = HEX_RADIUS): Vec2 {
  const a = (Math.PI / 180) * (60 * i + 30);
  return { x: size * Math.cos(a), z: size * Math.sin(a) };
}

export interface TrayPlacement {
  readonly x: number;
  readonly z: number;
  /** Rotação em y: o +z local da bandeja aponta para fora (para o jogador). */
  readonly rotationY: number;
}

export interface CameraPose {
  readonly target: Vec2;
  readonly azimuth: number;
  readonly polar: number;
  readonly distance: number;
}

export interface BoardLayout {
  readonly id: number;
  readonly center: Vec2;
  /** Direção unitária do centro do planeta para o tabuleiro. */
  readonly outward: Vec2;
  readonly tray: TrayPlacement;
  readonly focus: CameraPose;
}

export interface TableLayout {
  readonly centroid: Vec2;
  readonly boards: readonly BoardLayout[];
  /** Raio que cobre tabuleiros e bandejas, a partir do centróide. */
  readonly radius: number;
  readonly overview: CameraPose;
}

const len = (v: Vec2) => Math.hypot(v.x, v.z);
const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.z * b.z;

/** Cantos da bandeja em coordenadas de mundo. */
export function trayCorners(t: TrayPlacement, margin = 0): Vec2[] {
  const hw = TRAY.width / 2 + margin;
  const hd = TRAY.depth / 2 + margin;
  const c = Math.cos(t.rotationY);
  const s = Math.sin(t.rotationY);
  // Rotação em y de three: x' = x·cos + z·sin, z' = −x·sin + z·cos.
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([lx = 0, lz = 0]) => ({ x: t.x + lx * c + lz * s, z: t.z - lx * s + lz * c }));
}

/** Ponto em coordenadas locais da bandeja. */
export function toTrayLocal(t: TrayPlacement, p: Vec2): Vec2 {
  const dx = p.x - t.x;
  const dz = p.z - t.z;
  const c = Math.cos(t.rotationY);
  const s = Math.sin(t.rotationY);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

export function buildTableLayout(planet: Planet): TableLayout {
  const worldHexes = planet.hexes.map((h) => ({ boardId: h.boardId, p: hexToWorld(planet.toGlobal(h)) }));
  const centers = planet.boards.map((b) => hexToWorld(b.center));
  const centroid = {
    x: centers.reduce((s, c) => s + c.x, 0) / centers.length,
    z: centers.reduce((s, c) => s + c.z, 0) / centers.length,
  };
  const boardRadius = (planet.edge - 1) * SQRT3 * HEX_RADIUS + HEX_RADIUS;

  const boards = planet.boards.map((_, id): BoardLayout => {
    const center = centers[id] ?? { x: 0, z: 0 };
    const d = { x: center.x - centroid.x, z: center.z - centroid.z };
    const l = len(d);
    const outward = l < 1e-6 ? { x: 0, z: 1 } : { x: d.x / l, z: d.z / l };
    // Bandeja logo além do hex mais externo do tabuleiro nessa direção.
    const reach = Math.max(
      ...worldHexes
        .filter((h) => h.boardId === id)
        .map((h) => dot({ x: h.p.x - center.x, z: h.p.z - center.z }, outward)),
    );
    const dist = reach + HEX_RADIUS + TRAY.gap + TRAY.depth / 2;
    const rotationY = Math.atan2(outward.x, outward.z);
    const tray = { x: center.x + outward.x * dist, z: center.z + outward.z * dist, rotationY };
    const lean = boardRadius * 0.55;
    const focus: CameraPose = {
      target: { x: center.x + outward.x * lean, z: center.z + outward.z * lean },
      azimuth: rotationY,
      polar: CAMERA.boardPolar,
      distance: boardRadius * 3.0,
    };
    return { id, center, outward, tray, focus };
  });

  const radius = Math.max(
    ...boards.flatMap((b) =>
      trayCorners(b.tray).map((c) => len({ x: c.x - centroid.x, z: c.z - centroid.z })),
    ),
    ...worldHexes.map((h) => len({ x: h.p.x - centroid.x, z: h.p.z - centroid.z }) + HEX_RADIUS),
  );

  return {
    centroid,
    boards,
    radius,
    // Alvo um pouco à frente do centro: em perspectiva, o lado perto da câmera ocupa mais tela.
    overview: {
      target: { x: centroid.x, z: centroid.z + radius * 0.16 },
      azimuth: 0,
      polar: CAMERA.overviewPolar,
      distance: radius * 2.2,
    },
  };
}

/** Close em um hex, olhando do lado do dono do tabuleiro. */
export function hexFocus(layout: TableLayout, boardId: number, p: Vec2): CameraPose {
  const board = layout.boards[boardId];
  return {
    target: p,
    azimuth: board?.tray.rotationY ?? 0,
    polar: CAMERA.hexPolar,
    distance: CAMERA.hexDistance,
  };
}

/** Posição da câmera para uma pose (convenção do camera-controls: azimute 0 = câmera em +z). */
export function cameraPosition(pose: CameraPose, targetY = 0): { x: number; y: number; z: number } {
  const s = Math.sin(pose.polar) * pose.distance;
  return {
    x: pose.target.x + s * Math.sin(pose.azimuth),
    y: targetY + Math.cos(pose.polar) * pose.distance,
    z: pose.target.z + s * Math.cos(pose.azimuth),
  };
}

export interface Segment {
  readonly a: Vec2;
  readonly b: Vec2;
  /** Direção unitária para dentro do tabuleiro (perpendicular à aresta). */
  readonly inward: Vec2;
}

/**
 * Contorno de um tabuleiro: arestas de hex cujo vizinho não é do mesmo tabuleiro.
 * Vira a faixa na cor do dono em volta do tabuleiro.
 */
export function boardOutline(planet: Planet, boardId: number, size = HEX_RADIUS): Segment[] {
  const out: Segment[] = [];
  const own = planet.hexes.filter((h) => h.boardId === boardId);
  for (const h of own) {
    const c = hexToWorld(planet.toGlobal(h), size);
    for (const d of DIRECTIONS) {
      const n = { boardId, q: h.q + d.q, r: h.r + d.r };
      if (planet.contains(n)) continue;
      const nw = hexToWorld({ q: d.q, r: d.r }, size);
      const ang = Math.atan2(nw.z, nw.x);
      const corner = (da: number) => ({
        x: c.x + size * Math.cos(ang + da),
        z: c.z + size * Math.sin(ang + da),
      });
      out.push({
        a: corner(-Math.PI / 6),
        b: corner(Math.PI / 6),
        inward: { x: -Math.cos(ang), z: -Math.sin(ang) },
      });
    }
  }
  return out;
}
