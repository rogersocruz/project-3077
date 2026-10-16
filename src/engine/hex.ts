/**
 * Matemática hexagonal em coordenadas axiais (q, r), topo "pointy" ou "flat" é
 * decisão do render — aqui só há topologia.
 *
 * GDD 3.1: cada jogador tem um tabuleiro hexagonal de aresta n (3n² − 3n + 1 hexes).
 * Os tabuleiros se encaixam aresta com aresta numa grade hexagonal "macro": cada
 * tabuleiro ocupa uma célula macro (Q, R), e o layout de roseta lista as células.
 */

export interface Axial {
  readonly q: number;
  readonly r: number;
}

/** Hex local de um tabuleiro: coordenadas axiais relativas ao centro do tabuleiro. */
export interface BoardHex extends Axial {
  readonly boardId: number;
}

export const ORIGIN: Axial = { q: 0, r: 0 };

/** As 6 direções axiais, em ordem anti-horária a partir de "leste". */
export const DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const axial = (q: number, r: number): Axial => ({ q, r });
export const add = (a: Axial, b: Axial): Axial => ({ q: a.q + b.q, r: a.r + b.r });
export const sub = (a: Axial, b: Axial): Axial => ({ q: a.q - b.q, r: a.r - b.r });
export const scale = (a: Axial, k: number): Axial => ({ q: a.q * k, r: a.r * k });
export const equals = (a: Axial, b: Axial): boolean => a.q === b.q && a.r === b.r;
export const hexKey = (h: Axial): string => `${h.q},${h.r}`;
export const boardHexKey = (h: BoardHex): string => `${h.boardId}:${h.q},${h.r}`;

export function neighbors(h: Axial): Axial[] {
  return DIRECTIONS.map((d) => add(h, d));
}

export function distance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Todos os hexes a distância ≤ radius do centro (inclui o centro). */
export function hexesInRadius(center: Axial, radius: number): Axial[] {
  if (!Number.isInteger(radius) || radius < 0) throw new RangeError(`raio inválido: ${radius}`);
  const out: Axial[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const rMin = Math.max(-radius, -dq - radius);
    const rMax = Math.min(radius, -dq + radius);
    for (let dr = rMin; dr <= rMax; dr++) out.push({ q: center.q + dq, r: center.r + dr });
  }
  return out;
}

/** Hexes exatamente a distância `radius` do centro. */
export function ring(center: Axial, radius: number): Axial[] {
  return hexesInRadius(center, radius).filter((h) => distance(center, h) === radius);
}

/** GDD 3.1: hexes = 3n² − 3n + 1 para um tabuleiro de aresta n. */
export function hexCountForEdge(edge: number): number {
  return 3 * edge * edge - 3 * edge + 1;
}

/** Hexes locais de um tabuleiro de aresta n (raio n − 1 em volta da origem). */
export function boardHexes(edge: number): Axial[] {
  if (!Number.isInteger(edge) || edge < 1) throw new RangeError(`aresta inválida: ${edge}`);
  return hexesInRadius(ORIGIN, edge - 1);
}

/**
 * Centro global (em hexes) da célula macro (Q, R) para tabuleiros de aresta n.
 * Hexágonos de raio N = n − 1 ladrilham o plano sem buracos com os vetores
 * (2N+1, −N) e (N, N+1): vizinhos macro ficam encostados aresta com aresta.
 */
export function boardCenter(macro: Axial, edge: number): Axial {
  const n = edge - 1;
  return {
    q: macro.q * (2 * n + 1) + macro.r * n,
    r: -macro.q * n + macro.r * (n + 1),
  };
}

export interface PlanetBoard {
  readonly id: number;
  /** Célula na grade macro (do layout de roseta). */
  readonly macro: Axial;
  /** Centro do tabuleiro em coordenadas globais. */
  readonly center: Axial;
}

export interface Planet {
  readonly edge: number;
  readonly boards: readonly PlanetBoard[];
  /** Todos os hexes do planeta, tabuleiro por tabuleiro. */
  readonly hexes: readonly BoardHex[];
  toGlobal(h: BoardHex): Axial;
  /** null se a coordenada global não pertence a nenhum tabuleiro. */
  fromGlobal(g: Axial): BoardHex | null;
  contains(h: BoardHex): boolean;
  /** Vizinhos dentro do planeta, inclusive em tabuleiros encostados. */
  neighbors(h: BoardHex): BoardHex[];
  distance(a: BoardHex, b: BoardHex): number;
  areBoardsAdjacent(a: number, b: number): boolean;
  adjacentBoards(boardId: number): number[];
}

/**
 * Monta o planeta a partir do layout de roseta (células macro na ordem dos assentos).
 * O id de cada tabuleiro é o índice no layout.
 */
export function buildPlanet(edge: number, layout: readonly Axial[]): Planet {
  const local = boardHexes(edge);
  const boards: PlanetBoard[] = layout.map((macro, id) => ({ id, macro, center: boardCenter(macro, edge) }));

  const byGlobal = new Map<string, BoardHex>();
  const hexes: BoardHex[] = [];
  for (const board of boards) {
    for (const l of local) {
      const g = add(board.center, l);
      const key = hexKey(g);
      if (byGlobal.has(key)) throw new Error(`layout sobreposto: tabuleiro ${board.id} em ${key}`);
      const h: BoardHex = { boardId: board.id, q: l.q, r: l.r };
      byGlobal.set(key, h);
      hexes.push(h);
    }
  }

  const radius = edge - 1;
  const boardAt = (id: number): PlanetBoard => {
    const b = boards[id];
    if (!b) throw new RangeError(`tabuleiro inexistente: ${id}`);
    return b;
  };
  const toGlobal = (h: BoardHex): Axial => add(boardAt(h.boardId).center, h);
  const contains = (h: BoardHex): boolean =>
    h.boardId >= 0 && h.boardId < boards.length && distance(ORIGIN, h) <= radius;

  const adjacency = boards.map((a) =>
    boards.filter((b) => b.id !== a.id && distance(a.macro, b.macro) === 1).map((b) => b.id),
  );

  return {
    edge,
    boards,
    hexes,
    toGlobal,
    fromGlobal: (g) => byGlobal.get(hexKey(g)) ?? null,
    contains,
    neighbors: (h) =>
      neighbors(toGlobal(h))
        .map((g) => byGlobal.get(hexKey(g)))
        .filter((n): n is BoardHex => n !== undefined),
    distance: (a, b) => distance(toGlobal(a), toGlobal(b)),
    areBoardsAdjacent: (a, b) => adjacency[a]?.includes(b) ?? false,
    adjacentBoards: (id) => [...(adjacency[id] ?? [])],
  };
}
