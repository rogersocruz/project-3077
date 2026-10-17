/**
 * Marcas que as cartas e o planeta deixam no mapa (públicas): subsolo selado (Colapso de
 * Galeria, Crosta Fina), rendimento extra (Terraformação), estrutura parada por carta e,
 * na Fase 6, estados de hazard/evento (chip na cor da categoria) e o Guardião parado.
 * Pequenas, na borda do tile, para não esconder as peças.
 */
import { useMemo } from 'react';
import { BoxGeometry, CylinderGeometry, MeshStandardMaterial, RingGeometry, Color } from 'three';
import { palette, scene } from '../../ui/theme/tokens';
import { HEX_RADIUS, TILE_TOP_Y } from '../constants';
import { GLOW_INTENSITY } from '../materials';
import type { SceneHex, WorldMark } from '../model';
import { structureSlots } from '../placement';

const sealGeo = new BoxGeometry(0.34, 0.03, 0.08);
const plusGeo = new BoxGeometry(0.22, 0.03, 0.07);
const chipGeo = new CylinderGeometry(0.17, 0.17, 0.035, 20);
const ringGeo = new RingGeometry(0.26, 0.31, 28).rotateX(-Math.PI / 2);
const markGeo = new CylinderGeometry(0.11, 0.11, 0.04, 6);
const guardianGeo = new CylinderGeometry(0.07, 0.16, 0.62, 5);
const guardianEyeGeo = new BoxGeometry(0.12, 0.05, 0.05);

/** Cor de cada marca: a da categoria de evento que a causa (ART_DIRECTION 2.3). */
const MARK_COLOR: Record<WorldMark, string> = {
  ash: palette.event.thermal.color,
  contaminated: palette.event.climatic.color,
  dry: palette.event.seismic.color,
  sealed: palette.event.seismic.color,
  closed: palette.event.economic.color,
  grounded: palette.event.atmospheric.color,
  amplified: palette.event.atmospheric.color,
};

function glow(color: string, intensity = GLOW_INTENSITY * 0.5) {
  return new MeshStandardMaterial({
    color,
    emissive: new Color(color),
    emissiveIntensity: intensity,
    toneMapped: false,
  });
}

export function CardMarkers({ hexes }: { hexes: readonly SceneHex[] }) {
  const mats = useMemo(
    () => ({
      seal: glow(palette.card.delivered.headerFrom, 0.6),
      sealBase: new MeshStandardMaterial({ color: palette.frame[900], roughness: 0.6 }),
      bonus: glow(palette.ui.positive, 0.8),
      off: glow(scene.fx.idle, GLOW_INTENSITY * 0.6),
      marks: Object.fromEntries(
        Object.entries(MARK_COLOR).map(([k, c]) => [k, glow(c, GLOW_INTENSITY * 0.7)]),
      ) as Record<WorldMark, MeshStandardMaterial>,
      guardian: new MeshStandardMaterial({ color: palette.frame[700], roughness: 0.9 }),
      guardianEye: glow(palette.accent.orange, GLOW_INTENSITY),
    }),
    [],
  );
  const world = useMemo(() => {
    const out: { key: string; x: number; z: number; mark?: WorldMark; guardian?: boolean }[] = [];
    for (const h of hexes) {
      if (!h.revealed) continue;
      (h.marks ?? []).forEach((m, i) =>
        out.push({
          key: `${h.key}:${m}`,
          mark: m,
          x: h.world.x - 0.42 + i * 0.25,
          z: h.world.z - HEX_RADIUS * 0.55,
        }),
      );
      if (h.guardian)
        out.push({ key: `${h.key}:guardian`, guardian: true, x: h.world.x + 0.35, z: h.world.z - 0.2 });
    }
    return out;
  }, [hexes]);
  const marks = useMemo(() => {
    const out: { key: string; x: number; z: number; kind: 'seal' | 'bonus' | 'off'; n?: number }[] = [];
    for (const h of hexes) {
      if (!h.revealed && !h.sealed) continue;
      // Selo e bônus ficam na ponta de baixo do hex; parada, no pé da estrutura.
      if (h.sealed)
        out.push({
          key: `${h.key}:seal`,
          x: h.world.x - 0.3,
          z: h.world.z + HEX_RADIUS * 0.62,
          kind: 'seal',
        });
      if ((h.yieldBonus ?? 0) > 0) {
        out.push({
          key: `${h.key}:bonus`,
          x: h.world.x + 0.3,
          z: h.world.z + HEX_RADIUS * 0.62,
          kind: 'bonus',
          n: h.yieldBonus,
        });
      }
      const slots = structureSlots(h.structures.map((s) => s.type));
      h.structures.forEach((s, i) => {
        if (!s.disabled) return;
        const slot = slots[i] ?? { x: 0, z: 0, scale: 1 };
        out.push({ key: `${h.key}:off:${s.uid}`, x: h.world.x + slot.x, z: h.world.z + slot.z, kind: 'off' });
      });
    }
    return out;
  }, [hexes]);
  return (
    <group>
      {world.map((w) =>
        w.guardian ? (
          <group key={w.key} position={[w.x, TILE_TOP_Y + 0.31, w.z]}>
            <mesh geometry={guardianGeo} material={mats.guardian} castShadow />
            <mesh geometry={guardianEyeGeo} material={mats.guardianEye} position={[0, 0.17, 0.09]} />
          </group>
        ) : w.mark ? (
          <mesh
            key={w.key}
            geometry={markGeo}
            material={mats.marks[w.mark]}
            position={[w.x, TILE_TOP_Y + 0.03, w.z]}
          />
        ) : null,
      )}
      {marks.map((m) => {
        const y = TILE_TOP_Y + 0.02;
        if (m.kind === 'off') {
          return <mesh key={m.key} geometry={ringGeo} material={mats.off} position={[m.x, y + 0.01, m.z]} />;
        }
        if (m.kind === 'seal') {
          return (
            <group key={m.key} position={[m.x, y, m.z]}>
              <mesh geometry={chipGeo} material={mats.sealBase} />
              <mesh
                geometry={sealGeo}
                material={mats.seal}
                position={[0, 0.03, 0]}
                rotation={[0, Math.PI / 4, 0]}
              />
              <mesh
                geometry={sealGeo}
                material={mats.seal}
                position={[0, 0.03, 0]}
                rotation={[0, -Math.PI / 4, 0]}
              />
            </group>
          );
        }
        return (
          <group key={m.key} position={[m.x, y, m.z]}>
            <mesh geometry={chipGeo} material={mats.sealBase} />
            <mesh geometry={plusGeo} material={mats.bonus} position={[0, 0.03, 0]} />
            <mesh
              geometry={plusGeo}
              material={mats.bonus}
              position={[0, 0.03, 0]}
              rotation={[0, Math.PI / 2, 0]}
            />
          </group>
        );
      })}
    </group>
  );
}
