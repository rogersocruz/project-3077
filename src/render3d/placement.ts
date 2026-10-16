/**
 * Onde cada peça fica dentro do hex (coordenadas locais, raio do hex = 1). Puro.
 * Estruturas: uma sozinha no centro; várias em roda (a Vila, se houver, no centro).
 * Tropas: no centro se o hex está livre; senão na borda voltada para o dono.
 */
import type { SceneHex } from './model';

export interface Slot {
  readonly x: number;
  readonly z: number;
  readonly scale: number;
}

export function structureSlots(types: readonly string[]): Slot[] {
  const n = types.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: 0, z: 0, scale: 1 }];
  const villageAt = types.indexOf('village');
  const others = n - (villageAt >= 0 ? 1 : 0);
  const radius = villageAt >= 0 ? 0.56 : 0.36;
  const scale = villageAt >= 0 ? 0.5 : n === 2 ? 0.7 : 0.6;
  // Começa no fundo (−z, longe do jogador) para não esconder a peça central.
  const start = -Math.PI / 2 - (others > 1 ? Math.PI / others : 0);
  let k = 0;
  return types.map((t) => {
    if (t === 'village') return { x: 0, z: 0, scale: 0.78 };
    const a = start + (k++ / others) * Math.PI * 2;
    return { x: Math.cos(a) * radius, z: Math.sin(a) * radius, scale };
  });
}

export function troopSlots(hex: SceneHex): Slot[] {
  const n = hex.troops.length;
  const busy = hex.structures.length > 0;
  return hex.troops.map((_, i) => {
    if (!busy && n === 1) return { x: 0, z: 0.05, scale: 1.1 };
    const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.55;
    const r = busy ? 0.6 : 0.3;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, scale: busy ? 0.8 : 1 };
  });
}
