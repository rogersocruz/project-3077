/** Geometria da bandeja do jogador (ART_DIRECTION 6) sem three: posições locais e pilhas. */
import { RESOURCE_IDS, type ResourceId } from '../data/schemas';
import { TOKEN, TRAY } from './constants';
import type { TrayPlacement } from './layout';

const TOP = TRAY.height;

/** Posições na bandeja (coordenadas locais: x ao longo dela, +z para o jogador). */
export const TRAY_LAYOUT = {
  emblemX: -TRAY.width / 2 + 0.55,
  tokenX0: -TRAY.width / 2 + 1.35,
  tokenStep: 0.48,
  tokenZ0: -0.8,
  tokenColStep: 0.42,
  slotX0: 0.62,
  slotStep: 0.7,
  slotZ: -0.42,
  trackX0: 0.27,
  trackLength: 3.3,
  trackZ: [0.42, 0.68, 0.94],
  stripeZ: TRAY.depth / 2 - 0.09,
} as const;

/**
 * Topo da pilha de um recurso na bandeja (mundo): destino e origem dos tokens que voam
 * na produção, na banca e no comércio.
 */
export function trayStockPoint(
  t: TrayPlacement,
  resource: ResourceId,
  count: number,
): { x: number; y: number; z: number } {
  const i = RESOURCE_IDS.indexOf(resource);
  const shown = Math.max(0, Math.min(count, TOKEN.perColumn * TOKEN.maxColumns));
  const col = Math.min(TOKEN.maxColumns - 1, Math.floor(shown / TOKEN.perColumn));
  const lx = TRAY_LAYOUT.tokenX0 + i * TRAY_LAYOUT.tokenStep;
  const lz = TRAY_LAYOUT.tokenZ0 + col * TRAY_LAYOUT.tokenColStep;
  const c = Math.cos(t.rotationY);
  const s = Math.sin(t.rotationY);
  return {
    x: t.x + lx * c + lz * s,
    y: TOP + (shown % TOKEN.perColumn) * TOKEN.thickness,
    z: t.z - lx * s + lz * c,
  };
}

/** Local da bandeja → mundo (x ao longo dela, +z para o jogador). */
function trayToWorld(t: TrayPlacement, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(t.rotationY);
  const s = Math.sin(t.rotationY);
  return { x: t.x + lx * c + lz * s, z: t.z - lx * s + lz * c };
}

/** Centro do slot de permanente `slot` (topo da bandeja). */
export function traySlotPoint(t: TrayPlacement, slot: number): { x: number; y: number; z: number } {
  const p = trayToWorld(t, TRAY_LAYOUT.slotX0 + slot * TRAY_LAYOUT.slotStep, TRAY_LAYOUT.slotZ);
  return { x: p.x, y: TOP + 0.02, z: p.z };
}

/** Envelopes recebidos (cartas entregues): fileira acima dos slots. */
export const ENVELOPE = { width: 0.44, depth: 0.3, height: 0.025, step: 0.5, z: -1.08 } as const;

export function trayEnvelopePoint(t: TrayPlacement, i: number): { x: number; y: number; z: number } {
  const p = trayToWorld(t, TRAY_LAYOUT.slotX0 + i * ENVELOPE.step, ENVELOPE.z);
  return { x: p.x, y: TOP + ENVELOPE.height / 2 + 0.004, z: p.z };
}
