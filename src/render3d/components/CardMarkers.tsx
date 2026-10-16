/**
 * Marcas que as cartas deixam no mapa (públicas): subsolo selado (Colapso de Galeria),
 * rendimento extra (Terraformação) e estrutura parada por carta (Bomba de Íons, Pane
 * Induzida, Sobrecarga). Pequenas, na borda do tile, para não esconder as peças.
 */
import { useMemo } from 'react';
import { BoxGeometry, CylinderGeometry, MeshStandardMaterial, RingGeometry, Color } from 'three';
import { palette, scene } from '../../ui/theme/tokens';
import { HEX_RADIUS, TILE_TOP_Y } from '../constants';
import { GLOW_INTENSITY } from '../materials';
import type { SceneHex } from '../model';
import { structureSlots } from '../placement';

const sealGeo = new BoxGeometry(0.34, 0.03, 0.08);
const plusGeo = new BoxGeometry(0.22, 0.03, 0.07);
const chipGeo = new CylinderGeometry(0.17, 0.17, 0.035, 20);
const ringGeo = new RingGeometry(0.26, 0.31, 28).rotateX(-Math.PI / 2);

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
    }),
    [],
  );
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
