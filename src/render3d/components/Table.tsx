/**
 * Mesa e ambiente (ART_DIRECTION 6): tampo de madeira quente, luz principal quente de
 * cima-esquerda com sombras suaves, preenchimento frio, penumbra ao redor, reflexos de
 * um ambiente local (sem baixar HDR) e objetos de mesa opcionais.
 */
import { Environment, Lightformer } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace, type SpotLight, Object3D } from 'three';
import { useTranslation } from 'react-i18next';
import { fonts, palette, scene } from '../../ui/theme/tokens';
import { lathe, cyl, wheel } from '../geometry/primitives';
import type { TableLayout } from '../layout';
import { BOX_ANGLE, freeSpot, MUG_ANGLE } from '../tableSpots';
import { woodTexture } from '../materials';
import { paintBoxLid } from '../textures/misc';

const TABLE_THICKNESS = 0.6;

export function Lights({
  layout,
  shadows,
  shadowMapSize,
}: {
  layout: TableLayout;
  shadows: boolean;
  shadowMapSize: number;
}) {
  const R = layout.radius;
  const { x: cx, z: cz } = layout.centroid;
  const [spot, setSpot] = useState<SpotLight | null>(null);
  const target = useMemo(() => {
    const o = new Object3D();
    o.position.set(cx, 0, cz);
    return o;
  }, [cx, cz]);
  useEffect(() => {
    if (spot) spot.target = target;
  }, [spot, target]);
  const keyPos: [number, number, number] = [cx - R * 0.55, R * 1.9, cz - R * 0.35];
  return (
    <>
      <hemisphereLight args={[scene.light.ambientSky, scene.light.ambientGround, 0.55]} />
      {/* Luz principal: abajur quente acima-esquerda, cone que cai na penumbra. */}
      <spotLight
        ref={setSpot}
        position={keyPos}
        color={scene.light.key}
        intensity={3.4}
        angle={Math.atan((R * 1.35) / (R * 1.9))}
        penumbra={0.65}
        decay={0}
        castShadow={shadows}
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={6}
        shadow-camera-near={R * 0.8}
        shadow-camera-far={R * 4}
      />
      <primitive object={target} />
      {/* Preenchimento frio, do lado oposto. */}
      <directionalLight
        position={[cx + R * 0.9, R * 0.7, cz + R * 0.8]}
        color={scene.light.fill}
        intensity={0.55}
      />
    </>
  );
}

/** Reflexos para metais e tokens: estúdio montado localmente com painéis de luz. */
export function Reflections({ resolution }: { resolution: number }) {
  return (
    <Environment resolution={resolution} frames={1} environmentIntensity={0.55}>
      <Lightformer
        form="rect"
        intensity={2.2}
        color={scene.light.key}
        position={[-4, 6, -3]}
        scale={[6, 3, 1]}
      />
      <Lightformer
        form="rect"
        intensity={0.9}
        color={scene.light.fill}
        position={[5, 3, 4]}
        scale={[5, 2, 1]}
      />
      <Lightformer form="ring" intensity={0.6} color={palette.accent.orange} position={[0, 4, 6]} scale={2} />
    </Environment>
  );
}

export function TableTop({ layout }: { layout: TableLayout }) {
  const size = layout.radius * 2 + 7;
  const map = useMemo(() => woodTexture(1024, Math.max(1, Math.round(size / 16))), [size]);
  const mat = useMemo(
    () => new MeshStandardMaterial({ map, roughness: 0.62, metalness: 0.02, bumpMap: map, bumpScale: 0.6 }),
    [map],
  );
  return (
    <mesh
      position={[layout.centroid.x, -TABLE_THICKNESS / 2 - 0.001, layout.centroid.z]}
      material={mat}
      receiveShadow
    >
      <boxGeometry args={[size, TABLE_THICKNESS, size]} />
    </mesh>
  );
}

/** Caneca e caixa do jogo: clima de mesa real (desligável). */
export function TableProps({ layout }: { layout: TableLayout }) {
  const { t } = useTranslation();
  const mug = useMemo(() => {
    const body = lathe(
      [
        [0, 0],
        [0.3, 0],
        [0.32, 0.03],
        [0.32, 0.62],
        [0.29, 0.62],
        [0.29, 0.05],
        [0, 0.05],
      ],
      24,
    );
    return {
      body,
      handle: wheel(0.15, 0.035, 16, { x: 0.33, y: 0.33, rx: 0, ry: 0 }),
      coffee: cyl(0.29, 0.29, 0.01, 24, { y: 0.52 }),
      ceramic: new MeshStandardMaterial({ color: scene.props.mug, roughness: 0.35 }),
      liquid: new MeshStandardMaterial({ color: scene.props.coffee, roughness: 0.1 }),
    };
  }, []);
  // A tampa usa a fonte de título: espera ela carregar antes de pintar.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let alive = true;
    document.fonts
      .load(`700 64px ${fonts.display}`)
      .catch(() => undefined)
      .finally(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);
  const box = useMemo(() => {
    const lid = paintBoxLid(512, t('app.titleWord'), t('app.titleNumber'), fonts.display);
    const tex = new CanvasTexture(lid);
    tex.colorSpace = SRGBColorSpace;
    const side = new MeshStandardMaterial({ color: scene.props.box, roughness: 0.55, metalness: 0.2 });
    const top = new MeshStandardMaterial({ map: tex, roughness: 0.5 });
    return { mats: [side, side, top, side, side, side], ready: fontsReady };
  }, [t, fontsReady]);
  const a = freeSpot(layout, MUG_ANGLE);
  const b = freeSpot(layout, BOX_ANGLE);
  return (
    <group>
      <group position={[a.x, 0, a.z]} rotation={[0, a.angle + 0.8, 0]} scale={2.4}>
        <mesh geometry={mug.body} material={mug.ceramic} castShadow receiveShadow />
        <mesh geometry={mug.handle} material={mug.ceramic} castShadow />
        <mesh geometry={mug.coffee} material={mug.liquid} />
      </group>
      <group position={[b.x, 0, b.z]} rotation={[0, b.angle + 0.35, 0]}>
        <mesh position={[0, 0.275, 0]} material={box.mats} castShadow receiveShadow>
          <boxGeometry args={[3.2, 0.55, 3.2]} />
        </mesh>
      </group>
    </group>
  );
}
