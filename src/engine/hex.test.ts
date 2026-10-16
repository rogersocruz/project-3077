import { describe, expect, it } from 'vitest';
import layoutsJson from '../../data/layouts.json';
import {
  type Axial,
  axial,
  boardCenter,
  boardHexes,
  buildPlanet,
  DIRECTIONS,
  distance,
  hexCountForEdge,
  hexesInRadius,
  hexKey,
  neighbors,
  ORIGIN,
  ring,
} from './hex';

const layouts = layoutsJson.layouts as Record<string, Axial[]>;

describe('hex — coordenadas axiais', () => {
  it('cada hex tem 6 vizinhos, todos a distância 1', () => {
    const h = axial(2, -3);
    const ns = neighbors(h);
    expect(ns).toHaveLength(6);
    expect(new Set(ns.map(hexKey)).size).toBe(6);
    for (const n of ns) expect(distance(h, n)).toBe(1);
  });

  it('distância é simétrica e segue a métrica hexagonal', () => {
    expect(distance(ORIGIN, axial(3, 0))).toBe(3);
    expect(distance(ORIGIN, axial(2, -4))).toBe(4);
    expect(distance(axial(-1, 2), axial(2, -1))).toBe(distance(axial(2, -1), axial(-1, 2)));
    expect(distance(axial(1, 1), axial(1, 1))).toBe(0);
  });

  it('hexesInRadius devolve 3r² + 3r + 1 hexes, todos dentro do raio', () => {
    for (let r = 0; r <= 6; r++) {
      const hs = hexesInRadius(axial(5, -2), r);
      expect(hs).toHaveLength(3 * r * r + 3 * r + 1);
      expect(new Set(hs.map(hexKey)).size).toBe(hs.length);
      for (const h of hs) expect(distance(axial(5, -2), h)).toBeLessThanOrEqual(r);
    }
  });

  it('anel de raio r tem 6r hexes', () => {
    expect(ring(ORIGIN, 0)).toHaveLength(1);
    for (let r = 1; r <= 5; r++) expect(ring(ORIGIN, r)).toHaveLength(6 * r);
  });
});

describe('hex — tabuleiros (GDD 3.1)', () => {
  it('fórmula 3n² − 3n + 1: aresta 4 = 37, aresta 5 = 61', () => {
    expect(hexCountForEdge(4)).toBe(37);
    expect(hexCountForEdge(5)).toBe(61);
    for (let n = 1; n <= 7; n++) expect(boardHexes(n)).toHaveLength(hexCountForEdge(n));
  });

  it('aresta inválida falha', () => {
    expect(() => boardHexes(0)).toThrow();
    expect(() => boardHexes(2.5)).toThrow();
  });

  it.each([2, 3, 4, 5])('tabuleiros de aresta %i ladrilham o plano sem buracos nem sobreposição', (edge) => {
    // Centro + anel de 6: todo vizinho de um hex do tabuleiro central pertence a algum tabuleiro.
    const planet = buildPlanet(edge, [ORIGIN, ...DIRECTIONS]);
    expect(planet.hexes).toHaveLength(7 * hexCountForEdge(edge));
    for (const h of planet.hexes.filter((x) => x.boardId === 0)) {
      expect(planet.neighbors(h)).toHaveLength(6);
    }
  });

  it.each([2, 3, 4, 5])('aresta %i: tabuleiros macro-vizinhos se tocam por uma aresta inteira', (edge) => {
    for (const dir of DIRECTIONS) {
      const planet = buildPlanet(edge, [ORIGIN, dir]);
      const touching = planet.hexes.filter(
        (h) => h.boardId === 0 && planet.neighbors(h).some((n) => n.boardId === 1),
      );
      expect(touching).toHaveLength(edge);
    }
  });

  it('tabuleiros não vizinhos na grade macro não se tocam', () => {
    const planet = buildPlanet(4, [ORIGIN, axial(2, 0)]);
    const crossing = planet.hexes.filter((h) => planet.neighbors(h).some((n) => n.boardId !== h.boardId));
    expect(crossing).toHaveLength(0);
    expect(planet.areBoardsAdjacent(0, 1)).toBe(false);
  });

  it('distância entre centros de tabuleiros vizinhos é 2n − 1', () => {
    for (const edge of [3, 4, 5]) {
      for (const dir of DIRECTIONS) expect(distance(ORIGIN, boardCenter(dir, edge))).toBe(2 * edge - 1);
    }
  });

  it('layout sobreposto é rejeitado', () => {
    expect(() => buildPlanet(4, [ORIGIN, ORIGIN])).toThrow(/sobreposto/);
  });

  it('conversão local ↔ global é inversa', () => {
    const planet = buildPlanet(4, layouts['4'] ?? []);
    for (const h of planet.hexes) expect(planet.fromGlobal(planet.toGlobal(h))).toEqual(h);
    expect(planet.fromGlobal(axial(1000, 1000))).toBeNull();
  });
});

describe('hex — roseta 3–6 jogadores (data/layouts.json)', () => {
  const expectedMinNeighbors: Record<string, number> = { '3': 2, '4': 2, '5': 2, '6': 2 };

  it.each(['3', '4', '5', '6'])('roseta de %s jogadores', (players) => {
    const layout = layouts[players] ?? [];
    const n = Number(players);
    expect(layout).toHaveLength(n);

    for (const edge of [4, 5]) {
      const planet = buildPlanet(edge, layout);
      expect(planet.hexes).toHaveLength(n * hexCountForEdge(edge));

      for (const board of planet.boards) {
        const adj = planet.adjacentBoards(board.id);
        // Todo tabuleiro encosta em pelo menos 2 outros.
        expect(adj.length).toBeGreaterThanOrEqual(expectedMinNeighbors[players] ?? 0);
        // A adjacência do layout bate com a adjacência real entre hexes, nos dois sentidos.
        for (const other of planet.boards) {
          if (other.id === board.id) continue;
          const touches = planet.hexes.some(
            (h) => h.boardId === board.id && planet.neighbors(h).some((x) => x.boardId === other.id),
          );
          expect(touches).toBe(planet.areBoardsAdjacent(board.id, other.id));
        }
      }
    }
  });

  it('roseta de 3: os três tabuleiros se tocam mutuamente', () => {
    const planet = buildPlanet(4, layouts['3'] ?? []);
    expect(planet.areBoardsAdjacent(0, 1)).toBe(true);
    expect(planet.areBoardsAdjacent(1, 2)).toBe(true);
    expect(planet.areBoardsAdjacent(0, 2)).toBe(true);
  });

  it('roseta de 6 com aresta 4 tem 222 hexes', () => {
    expect(buildPlanet(4, layouts['6'] ?? []).hexes).toHaveLength(222);
  });

  it('o conjunto de tabuleiros é conexo em todas as rosetas', () => {
    for (const layout of Object.values(layouts)) {
      const planet = buildPlanet(4, layout);
      const seen = new Set([0]);
      const queue = [0];
      while (queue.length) {
        const id = queue.shift() as number;
        for (const n of planet.adjacentBoards(id)) {
          if (seen.has(n)) continue;
          seen.add(n);
          queue.push(n);
        }
      }
      expect(seen.size).toBe(layout.length);
    }
  });
});
