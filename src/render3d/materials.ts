/**
 * Materiais da cena, criados uma vez e compartilhados (cache por chave).
 * Cores sempre dos tokens (ui/theme/tokens.ts).
 */
import {
  CanvasTexture,
  Color,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import type { BackKind } from '../ui/card/CardBack';
import { cardBackCanvas, cardFaceCanvas } from '../ui/card/texture';
import { type CardCategoryKey, type FactionKey, palette, scene } from '../ui/theme/tokens';
import type { StructureRole } from './geometry/structures';
import { paintBrushedMetal, paintCardFace, paintWood } from './textures/misc';
import { paintFog, paintTerrain, type TerrainPainting } from './textures/terrain';

const cache = new Map<string, unknown>();
function memo<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key) as T;
}

function colorTexture(canvas: HTMLCanvasElement, anisotropy = 8): CanvasTexture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

/** Intensidade de emissivos que devem "vazar" no bloom (acima do limiar). */
export const GLOW_INTENSITY = 2.2;

function paintedMaterial(
  p: TerrainPainting,
  roughness: number,
  metalness: number,
  bump: number,
): MeshStandardMaterial {
  const map = colorTexture(p.color);
  const m = new MeshStandardMaterial({ map, roughness, metalness, bumpMap: map, bumpScale: bump });
  if (p.emissive) {
    m.emissiveMap = colorTexture(p.emissive);
    m.emissive = new Color('#ffffff');
    m.emissiveIntensity = GLOW_INTENSITY;
  }
  return m;
}

export function terrainMaterial(id: string, size: number): MeshStandardMaterial {
  return memo(`terrain:${id}:${size}`, () => paintedMaterial(paintTerrain(id, size), 0.86, 0.02, 1.2));
}

export function fogMaterial(size: number): MeshStandardMaterial {
  return memo(`fog:${size}`, () => {
    const m = paintedMaterial(paintFog(size), 0.5, 0.6, 2.2);
    m.emissiveIntensity = 1;
    return m;
  });
}

/** Lateral do tile: frame.800. Filete do bisel: frame.edge metálico. */
export const tileSideMaterial = () =>
  memo(
    'tile:side',
    () => new MeshStandardMaterial({ color: palette.frame[800], roughness: 0.75, metalness: 0.2 }),
  );
export const tileBevelMaterial = () =>
  memo(
    'tile:bevel',
    () => new MeshStandardMaterial({ color: palette.frame.edge, roughness: 0.55, metalness: 0.55 }),
  );
/** Moldura dourada fina dos hazards únicos (ART_DIRECTION 5). */
export const hazardBevelMaterial = () =>
  memo(
    'tile:hazardBevel',
    () =>
      new MeshStandardMaterial({
        color: scene.hazardRim,
        roughness: 0.25,
        metalness: 1,
        emissive: new Color(scene.hazardRim),
        emissiveIntensity: 0.25,
      }),
  );

export const boardPlateMaterial = () =>
  memo(
    'board:plate',
    () => new MeshStandardMaterial({ color: palette.frame[900], roughness: 0.8, metalness: 0.25 }),
  );

export function factionColor(f: FactionKey): string {
  return palette.faction[f].color;
}

/** Faixa na cor da facção: levemente emissiva para ler na penumbra. */
export function accentMaterial(f: FactionKey): MeshStandardMaterial {
  return memo(
    `accent:${f}`,
    () =>
      new MeshStandardMaterial({
        color: factionColor(f),
        roughness: 0.45,
        metalness: 0.25,
        emissive: new Color(factionColor(f)),
        emissiveIntensity: 0.12,
        flatShading: true,
      }),
  );
}

/**
 * Faixa da facção para peças instanciadas: base neutra clara, a cor vem da instância
 * (setColorAt) — um material para todas as facções.
 */
export const instancedAccentMaterial = () =>
  memo(
    'accent:instanced',
    () =>
      new MeshStandardMaterial({
        color: palette.paper[100],
        roughness: 0.45,
        metalness: 0.25,
        flatShading: true,
      }),
  );

export function structureMaterial(role: Exclude<StructureRole, 'accent'>): MeshStandardMaterial {
  return memo(`structure:${role}`, () => {
    const s = scene.structure;
    switch (role) {
      case 'body':
        return new MeshStandardMaterial({
          color: s.body,
          roughness: 0.7,
          metalness: 0.05,
          flatShading: true,
        });
      case 'roof':
        return new MeshStandardMaterial({ color: s.roof, roughness: 0.6, metalness: 0.3, flatShading: true });
      case 'metal':
        return new MeshStandardMaterial({
          color: s.metal,
          roughness: 0.38,
          metalness: 0.55,
          flatShading: true,
        });
      case 'dark':
        return new MeshStandardMaterial({ color: s.dark, roughness: 0.6, metalness: 0.4, flatShading: true });
      case 'glow':
        return new MeshStandardMaterial({
          color: s.glow,
          emissive: new Color(s.glow),
          emissiveIntensity: GLOW_INTENSITY,
          toneMapped: false,
        });
    }
  });
}

export const propMaterial = () =>
  memo(
    'props',
    () =>
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05, flatShading: true }),
  );

export function tokenMaterial(resource: keyof typeof palette.resource): MeshStandardMaterial {
  return memo(
    `token:${resource}`,
    () =>
      new MeshStandardMaterial({
        color: palette.resource[resource].color,
        roughness: 0.28,
        metalness: resource === 'coal' || resource === 'food' || resource === 'oil' ? 0.55 : 0.9,
      }),
  );
}

export const starMaterial = () =>
  memo(
    'star',
    () =>
      new MeshStandardMaterial({
        color: scene.star,
        emissive: new Color(scene.star),
        emissiveIntensity: 1.6,
        metalness: 0.6,
        roughness: 0.3,
        toneMapped: false,
      }),
  );

export function woodTexture(size: number, repeat: number): Texture {
  return memo(`wood:${size}:${repeat}`, () => {
    const t = colorTexture(paintWood(size), 16);
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.repeat.set(repeat, repeat);
    return t;
  });
}

export const trayMaterial = () =>
  memo('tray', () => {
    const t = colorTexture(paintBrushedMetal(256));
    return new MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.7 });
  });

export const trayEdgeMaterial = () =>
  memo(
    'tray:edge',
    () => new MeshStandardMaterial({ color: palette.frame.edge, roughness: 0.3, metalness: 0.9 }),
  );

export const slotMaterial = () =>
  memo(
    'tray:slot',
    () => new MeshStandardMaterial({ color: palette.frame[900], roughness: 0.9, metalness: 0.1 }),
  );

/**
 * Face da carta `id`: começa com o substituto procedural da categoria e troca pela
 * rasterização do SVG da carta (ui/card) quando ela fica pronta.
 */
export function cardFaceMaterial(id: string, category: CardCategoryKey): MeshStandardMaterial {
  return memo(`card:${id}`, () => {
    const mat = new MeshStandardMaterial({ map: colorTexture(paintCardFace(category, 256)), roughness: 0.6 });
    void cardFaceCanvas(id).then((canvas) => {
      if (!canvas) return;
      mat.map?.dispose();
      mat.map = colorTexture(canvas);
      mat.needsUpdate = true;
    });
    return mat;
  });
}

/** Verso de baralho (n1/n2/n3/Tesouro): o SVG do verso rasterizado; frame.900 até ficar pronto. */
export function cardBackMaterial(kind: BackKind): MeshStandardMaterial {
  return memo(`cardBack:${kind}`, () => {
    const mat = new MeshStandardMaterial({ color: palette.frame[900], roughness: 0.55 });
    void cardBackCanvas(kind).then((canvas) => {
      if (!canvas) return;
      mat.map = colorTexture(canvas);
      mat.color.setScalar(1);
      mat.needsUpdate = true;
    });
    return mat;
  });
}

/** Borda das cartas empilhadas (papelão claro). */
export const cardEdgeMaterial = () =>
  memo('cardEdge', () => new MeshStandardMaterial({ color: palette.paper[300], roughness: 0.85 }));

/** Envelope da carta entregue (papel creme) e o lacre (cor da carta entregue). */
export const envelopeMaterial = () =>
  memo('envelope', () => new MeshStandardMaterial({ color: palette.paper[100], roughness: 0.8 }));

export const sealMaterial = () =>
  memo(
    'envelope:seal',
    () =>
      new MeshStandardMaterial({
        color: palette.card.delivered.headerFrom,
        emissive: new Color(palette.card.delivered.headerFrom),
        emissiveIntensity: 0.35,
        roughness: 0.4,
        metalness: 0.2,
      }),
  );

export function highlightMaterial(kind: 'hover' | 'select'): MeshStandardMaterial {
  return memo(`highlight:${kind}`, () => {
    const color = scene.highlight[kind];
    return new MeshStandardMaterial({
      color,
      emissive: new Color(color),
      emissiveIntensity: GLOW_INTENSITY,
      toneMapped: false,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
  });
}
