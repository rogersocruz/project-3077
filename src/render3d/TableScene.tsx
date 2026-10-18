/**
 * A mesa 3D completa. Entrada: o modelo de cena (model.ts) e o planeta do motor
 * (geometria). Saída para a UI: sceneStore (hover, seleção, foco da câmera).
 */
import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { PCFShadowMap } from 'three';
import type { Planet } from '../engine/hex';
import { prefersReducedMotion, QUALITY_PROFILES, useSettings } from '../settings';
import { scene } from '../ui/theme/tokens';
import { CAMERA } from './constants';
import { AdaptiveMonitor } from './components/AdaptiveMonitor';
import { Boards } from './components/Board';
import { CardMarkers } from './components/CardMarkers';
import { CameraRig } from './components/CameraRig';
import { FpsLimiter } from './components/FpsLimiter';
import { FrameProbe } from './components/FrameProbe';
import { Fx } from './components/Fx';
import { HexTiles } from './components/HexTiles';
import { Highlight } from './components/Highlight';
import { Piles } from './components/Piles';
import { Pieces } from './components/Pieces';
import { Projector } from './components/Projector';
import { Post } from './components/Post';
import { StaticShadows } from './components/StaticShadows';
import { SubsoilMarkers } from './components/SubsoilMarkers';
import { Lights, Reflections, TableProps, TableTop } from './components/Table';
import { TerrainProps } from './components/TerrainProps';
import { TestHooks } from './components/TestHooks';
import { Trays } from './components/Tray';
import { buildTableLayout, cameraPosition } from './layout';
import type { SceneModel } from './model';
import { useFxStore } from './fxStore';
import { useSceneStore } from './sceneStore';
import { adaptDprScale, adaptPost, anyPost } from './adaptive';

export interface TableSceneProps {
  planet: Planet;
  model: SceneModel;
  className?: string;
}

export function TableScene({ planet, model, className }: TableSceneProps) {
  const render = useSettings((s) => s.render);
  const profile = QUALITY_PROFILES[render.quality];
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);
  const layout = useMemo(() => buildTableLayout(planet), [planet]);
  const select = useSceneStore((s) => s.select);

  // Peças animadas (fxStore) saem dos lotes enquanto a cópia animada está na mesa.
  const fxActive = useFxStore((s) => s.items.length > 0);
  const hiddenHexes = useFxStore((s) => s.hiddenHexes);
  const hiddenStructures = useFxStore((s) => s.hiddenStructures);
  const tileHexes = useMemo(
    () => (hiddenHexes.size ? model.hexes.filter((h) => !hiddenHexes.has(h.key)) : model.hexes),
    [model.hexes, hiddenHexes],
  );
  const pieceHexes = useMemo(
    () =>
      hiddenStructures.size
        ? model.hexes.map((h) =>
            h.structures.some((s) => hiddenStructures.has(s.uid))
              ? { ...h, structures: h.structures.filter((s) => !hiddenStructures.has(s.uid)) }
              : h,
          )
        : model.hexes,
    [model.hexes, hiddenStructures],
  );

  const factions = useMemo(() => model.players.map((p) => p.faction), [model.players]);
  const trayPlacements = useMemo(
    () => model.players.map((p) => layout.boards[p.boardId]?.tray),
    [model.players, layout],
  );
  const facing = useMemo(() => layout.boards.map((b) => b.tray.rotationY), [layout]);
  const start = cameraPosition(layout.overview);

  // Qualidade adaptativa (adaptive.ts): degrau sobe quando o FPS cai.
  const [tier, setTier] = useState(0);
  const setAutoTier = useSceneStore((s) => s.setAutoTier);
  const effTier = render.adaptiveQuality ? tier : 0;
  useEffect(() => setAutoTier(effTier), [effTier, setAutoTier]);
  // UX_SPEC 3.1: antisserrilhado escolhido (desligado · FXAA · SMAA).
  const post = adaptPost(
    { ...render.post, smaa: render.antialias === 'smaa' },
    effTier,
    render.antialias === 'fxaa',
  );
  const postOn = anyPost(post);
  const deviceDpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio;
  const baseDpr = Math.min(Math.max(deviceDpr, profile.dpr[0]), profile.dpr[1]);
  // Escala de renderização 50–150% (UX_SPEC 3.1).
  const dpr = Math.max(0.5, baseDpr * adaptDprScale(effTier) * render.renderScale);
  const controls = useSettings((s) => s.controls);
  // Paleta trocada (modo daltônico): remonta para os materiais lerem as cores novas.
  const colorMode = useSettings((s) => s.accessibility.colorMode);

  return (
    <Canvas
      key={colorMode}
      className={className}
      frameloop={render.fpsLimit ? 'never' : 'always'}
      // PCF com raio: sombra suave e mais barata que PCFSoft (que ignora o raio).
      shadows={render.shadows ? { type: PCFShadowMap } : false}
      dpr={dpr}
      gl={{ antialias: !postOn, powerPreference: 'high-performance' }}
      camera={{ fov: CAMERA.fov, near: 0.1, far: layout.radius * 12, position: [start.x, start.y, start.z] }}
      onPointerMissed={() => select(null)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <color attach="background" args={[scene.backdrop]} />
      <fog attach="fog" args={[scene.backdrop, layout.radius * 3, layout.radius * 6.5]} />
      <Lights layout={layout} shadows={render.shadows} shadowMapSize={profile.shadowMapSize} />
      <Suspense fallback={null}>
        <Reflections resolution={profile.envResolution} />
      </Suspense>
      <TableTop layout={layout} />
      {render.props && <TableProps layout={layout} />}
      <Boards planet={planet} hexes={model.hexes} players={model.players} />
      <HexTiles hexes={tileHexes} textureSize={profile.textureSize} facing={facing} />
      {profile.microGeometry && <TerrainProps hexes={tileHexes} reducedMotion={reducedMotion} />}
      <Pieces hexes={pieceHexes} factions={factions} facing={facing} reducedMotion={reducedMotion} />
      <SubsoilMarkers hexes={tileHexes} facing={facing} />
      <CardMarkers hexes={tileHexes} />
      <Trays players={model.players} placements={trayPlacements} />
      {model.piles && <Piles piles={model.piles} layout={layout} />}
      <Highlight hexes={model.hexes} reducedMotion={reducedMotion} />
      <Fx
        hexes={model.hexes}
        players={model.players}
        layout={layout}
        facing={facing}
        textureSize={profile.textureSize}
        reducedMotion={reducedMotion}
      />
      <CameraRig
        layout={layout}
        hexes={model.hexes}
        keys={render.keys}
        smoothTime={render.cameraSmoothTime}
        invertOrbit={render.invertOrbit}
        reducedMotion={reducedMotion}
        controls={controls}
      />
      {render.fpsLimit > 0 && <FpsLimiter fps={render.fpsLimit} />}
      {postOn && <Post post={post} />}
      {render.adaptiveQuality && <AdaptiveMonitor onTier={setTier} />}
      {/* Conteúdo novo (modelo) ou geometria nova (qualidade/objetos) pede sombras novas. */}
      {render.shadows && (
        <StaticShadows key={`${render.quality}:${render.props}`} version={model} live={fxActive} />
      )}
      <FrameProbe />
      <Projector layout={layout} hexes={model.hexes} players={model.players} />
      {import.meta.env.DEV && <TestHooks hexes={model.hexes} />}
    </Canvas>
  );
}
