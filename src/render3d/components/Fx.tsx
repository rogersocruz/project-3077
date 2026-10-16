/**
 * Efeitos animados (UX_SPEC 6, ART_DIRECTION 7–8): cópias fora do lote das peças que
 * se mexem. O diretor (src/anim) anima `item.p` com GSAP; aqui só se lê `p` a cada
 * quadro. Com "reduzir movimento", as translações viram fade (o diretor anima `fade`).
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  type BufferGeometry,
  CylinderGeometry,
  type Group,
  IcosahedronGeometry,
  type InstancedMesh,
  type Material,
  Matrix4,
  type Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three';
import { Rng } from '../../engine/rng';
import { palette, scene } from '../../ui/theme/tokens';
import { BOARD_PLATE_HEIGHT, TILE_HEIGHT, TILE_TOP_Y } from '../constants';
import { createHexTileGeometry } from '../geometry/hexTile';
import { tokenGeometry } from '../geometry/pieces';
import {
  levelRingGeometry,
  levelRingRadius,
  STRUCTURE_ROLES,
  structureFootprint,
  structureGeometry,
} from '../geometry/structures';
import { type FxAnchor, type FxItem, useFxStore } from '../fxStore';
import { CardFlyFx, EnvelopeFx } from './CardsFx';
import type { TableLayout } from '../layout';
import {
  accentMaterial,
  fogMaterial,
  GLOW_INTENSITY,
  hazardBevelMaterial,
  structureMaterial,
  terrainMaterial,
  tileBevelMaterial,
  tileSideMaterial,
  tokenMaterial,
} from '../materials';
import type { SceneHex, ScenePlayer } from '../model';
import { trayStockPoint } from '../trayLayout';

const UP = new Vector3(0, 1, 0);
const snap60 = (a: number) => Math.round(a / (Math.PI / 3)) * (Math.PI / 3);

let tileGeo: BufferGeometry | null = null;
const tileGeometry = () => (tileGeo ??= createHexTileGeometry());

/** Clones transparentes para fade (só quando preciso); descartados ao desmontar. */
function useFadeMaterials(base: readonly Material[], enabled: boolean): Material[] {
  const mats = useMemo(
    () =>
      base.map((m) => {
        if (!enabled) return m;
        const c = m.clone();
        c.transparent = true;
        c.depthWrite = false;
        return c;
      }),
    [base, enabled],
  );
  useEffect(
    () => () => {
      if (enabled) for (const m of mats) m.dispose();
    },
    [mats, enabled],
  );
  return mats;
}

function setOpacity(mats: readonly Material[], v: number) {
  for (const m of mats) m.opacity = v;
}

interface Ctx {
  readonly byKey: ReadonlyMap<string, SceneHex>;
  readonly players: readonly ScenePlayer[];
  readonly layout: TableLayout;
  readonly facing: readonly number[];
  readonly textureSize: number;
  readonly reduced: boolean;
}

function tileMaterials(terrain: string | null, hazard: boolean, size: number): Material[] {
  return [
    terrain ? terrainMaterial(terrain, size) : fogMaterial(size),
    hazard ? hazardBevelMaterial() : tileBevelMaterial(),
    tileSideMaterial(),
  ];
}

// ── Tiles ────────────────────────────────────────────────────────────────────

function TileFlip({ item, c }: { item: Extract<FxItem, { kind: 'tileFlip' }>; c: Ctx }) {
  const hex = c.byKey.get(item.hex);
  const facing = c.facing[hex?.boardId ?? 0] ?? 0;
  const fog = useMemo(() => tileMaterials(null, false, c.textureSize), [c.textureSize]);
  const terr = useMemo(
    () => tileMaterials(item.terrain, item.hazard, c.textureSize),
    [item.terrain, item.hazard, c.textureSize],
  );
  const fogFade = useFadeMaterials(fog, c.reduced);
  const terrFade = useFadeMaterials(terr, c.reduced);
  const pivot = useRef<Group>(null);
  const mesh = useRef<Mesh>(null);
  // Gira em torno do eixo "da direita" do dono: o tile vira na direção dele.
  const axis = useMemo(() => new Vector3(1, 0, 0).applyAxisAngle(UP, facing), [facing]);
  const qa = useMemo(() => new Quaternion(), []);
  const qb = useMemo(() => new Quaternion(), []);

  useFrame(() => {
    const g = pivot.current;
    const m = mesh.current;
    if (!g || !m || !hex) return;
    const { lift, flip, fade } = item.p;
    g.position.set(hex.world.x, BOARD_PLATE_HEIGHT + TILE_HEIGHT / 2 + lift, hex.world.z);
    if (c.reduced) {
      setOpacity(terrFade, fade);
      setOpacity(fogFade, 1 - fade);
      return;
    }
    // Primeira metade: verso (névoa) virado para o dono; na metade, de lado, troca pela
    // face pintada vindo de −90° — o prisma é simétrico, a troca não aparece.
    const front = flip < 0.5;
    qa.setFromAxisAngle(axis, front ? flip * Math.PI : (flip - 1) * Math.PI);
    qb.setFromAxisAngle(UP, front ? snap60(facing) : 0);
    g.quaternion.multiplyQuaternions(qa, qb);
    m.material = front ? fog : terr;
  });

  return (
    <group ref={pivot}>
      <mesh
        ref={mesh}
        geometry={tileGeometry()}
        material={c.reduced ? terrFade : fog}
        position={[0, -TILE_HEIGHT / 2, 0]}
        castShadow
        receiveShadow
      />
      {c.reduced && (
        <mesh
          geometry={tileGeometry()}
          material={fogFade}
          position={[0, -TILE_HEIGHT / 2 + 0.001, 0]}
          rotation={[0, snap60(facing), 0]}
        />
      )}
    </group>
  );
}

function TileTilt({ item, c }: { item: Extract<FxItem, { kind: 'tileTilt' }>; c: Ctx }) {
  const hex = c.byKey.get(item.hex);
  const facing = c.facing[hex?.boardId ?? 0] ?? 0;
  const mats = useMemo(
    () => tileMaterials(item.terrain, item.hazard, c.textureSize),
    [item.terrain, item.hazard, c.textureSize],
  );
  const pivot = useRef<Group>(null);
  const axis = useMemo(() => new Vector3(1, 0, 0).applyAxisAngle(UP, facing), [facing]);
  const qa = useMemo(() => new Quaternion(), []);
  const qb = useMemo(
    () => new Quaternion().setFromAxisAngle(UP, item.terrain ? 0 : snap60(facing)),
    [item.terrain, facing],
  );
  useFrame(() => {
    const g = pivot.current;
    if (!g || !hex) return;
    const t = item.p.tilt;
    // Inclina pela borda de trás: a frente sobe e mostra o "corte" do subsolo.
    g.position.set(hex.world.x, BOARD_PLATE_HEIGHT + t * 0.12, hex.world.z);
    qa.setFromAxisAngle(axis, -t * 0.38);
    g.quaternion.multiplyQuaternions(qa, qb);
  });
  return (
    <group ref={pivot}>
      <mesh geometry={tileGeometry()} material={mats} castShadow receiveShadow />
    </group>
  );
}

const PUFFS = 12;
const puffGeo = new IcosahedronGeometry(0.07, 0);

function Dust({ item, c }: { item: Extract<FxItem, { kind: 'dust' }>; c: Ctx }) {
  const hex = c.byKey.get(item.hex);
  const ref = useRef<InstancedMesh>(null);
  const mat = useMemo(
    () =>
      new MeshStandardMaterial({
        color: scene.fx.dust,
        roughness: 1,
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  const m = useMemo(() => new Matrix4(), []);
  const pos = useMemo(() => new Vector3(), []);
  const scl = useMemo(() => new Vector3(), []);
  const rot = useMemo(() => new Quaternion(), []);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh || !hex) return;
    const t = item.p.t;
    for (let i = 0; i < PUFFS; i++) {
      const a = (i / PUFFS) * Math.PI * 2 + (i % 2) * 0.2;
      const r = 0.82 + t * 0.55;
      pos.set(
        hex.world.x + Math.cos(a) * r,
        TILE_TOP_Y - 0.05 + Math.sin(t * Math.PI) * 0.12,
        hex.world.z + Math.sin(a) * r,
      );
      scl.setScalar(0.6 + t * 1.6);
      m.compose(pos, rot, scl);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    // t = 0: ainda não começou (o diretor só anima a poeira quando o tile pousa).
    mat.opacity = t <= 0 ? 0 : 0.75 * (1 - t);
  });
  return <instancedMesh ref={ref} args={[puffGeo, mat, PUFFS]} frustumCulled={false} />;
}

// ── Varredura (Sondar) ───────────────────────────────────────────────────────

const scanGeo = new RingGeometry(0.93, 1, 72).rotateX(-Math.PI / 2);

function useGlowBasic(color: string) {
  const mat = useMemo(
    () =>
      new MeshBasicMaterial({
        color,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    [color],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  return mat;
}

function Scan({ item, c }: { item: Extract<FxItem, { kind: 'scan' }>; c: Ctx }) {
  const from = c.byKey.get(item.from);
  const to = c.byKey.get(item.to);
  const ref = useRef<Mesh>(null);
  const mat = useGlowBasic(scene.fx.scan);
  const reach = from && to ? Math.hypot(to.world.x - from.world.x, to.world.z - from.world.z) + 0.8 : 1;
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = item.p.t;
    mesh.scale.setScalar(0.25 + t * reach);
    mat.opacity = Math.min(1, (1 - t) * 1.6);
  });
  if (!from) return null;
  return (
    <mesh
      ref={ref}
      geometry={scanGeo}
      material={mat}
      position={[from.world.x, TILE_TOP_Y + 0.03, from.world.z]}
      renderOrder={3}
    />
  );
}

// ── Estruturas ───────────────────────────────────────────────────────────────

type Placed = Extract<FxItem, { kind: 'structure' | 'sparks' | 'levelUp' | 'idle' }>;

/** Matriz base de uma peça num hex: centro do hex, virada para o dono, no slot. */
function useSlotMatrix(item: Placed, c: Ctx): Matrix4 | null {
  const hex = c.byKey.get(item.hex);
  return useMemo(() => {
    if (!hex) return null;
    const facing = c.facing[hex.boardId] ?? 0;
    const base = new Matrix4().compose(
      new Vector3(hex.world.x, TILE_TOP_Y, hex.world.z),
      new Quaternion().setFromAxisAngle(UP, facing),
      new Vector3(1, 1, 1),
    );
    return base.multiply(
      new Matrix4().compose(
        new Vector3(item.slot.x, 0, item.slot.z),
        new Quaternion(),
        new Vector3(item.slot.scale, item.slot.scale, item.slot.scale),
      ),
    );
  }, [hex, c.facing, item.slot]);
}

function StructureFx({ item, c }: { item: Extract<FxItem, { kind: 'structure' }>; c: Ctx }) {
  const matrix = useSlotMatrix(item, c);
  const faction = c.players[item.owner]?.faction ?? 'revolutionaries';
  const geo = structureGeometry(item.type);
  const parts = useMemo(() => {
    const out: { geometry: BufferGeometry; material: Material }[] = [];
    for (const role of STRUCTURE_ROLES) {
      const g = geo[role];
      if (!g) continue;
      out.push({
        geometry: g,
        material: role === 'accent' ? accentMaterial(faction) : structureMaterial(role),
      });
    }
    for (let k = 0; k < item.level; k++) {
      out.push({
        geometry: levelRingGeometry(levelRingRadius(item.type, k)),
        material: accentMaterial(faction),
      });
    }
    return out;
  }, [geo, faction, item.type, item.level]);
  const base = useMemo(() => parts.map((p) => p.material), [parts]);
  const mats = useFadeMaterials(base, c.reduced);
  const group = useRef<Group>(null);
  const height = 0.5;

  useFrame(() => {
    const g = group.current;
    if (!g || !matrix) return;
    const { rise, fade } = item.p;
    matrix.decompose(g.position, g.quaternion, g.scale);
    if (c.reduced) {
      setOpacity(mats, fade);
      return;
    }
    // Sobe "de dentro" do tile (o topo do tile esconde o que ainda está abaixo).
    g.position.y -= (1 - rise) * height * item.slot.scale;
    g.scale.y *= 0.6 + 0.4 * Math.min(1, rise * 1.15);
  });

  return (
    <group ref={group}>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={mats[i]} castShadow receiveShadow />
      ))}
    </group>
  );
}

const SPARKS = 18;
const sparkGeo = new IcosahedronGeometry(0.022, 0);

function Sparks({ item, c }: { item: Extract<FxItem, { kind: 'sparks' }>; c: Ctx }) {
  const matrix = useSlotMatrix(item, c);
  const ref = useRef<InstancedMesh>(null);
  const seeds = useMemo(() => {
    const rng = Rng.fromSeed(`sparks:${item.id}`);
    return Array.from({ length: SPARKS }, () => ({
      a: rng.next() * Math.PI * 2,
      v: 0.5 + rng.next() * 0.6,
      up: 1.1 + rng.next() * 0.9,
    }));
  }, [item.id]);
  const m = useMemo(() => new Matrix4(), []);
  const p = useMemo(() => new Vector3(), []);
  const s = useMemo(() => new Vector3(), []);
  const q = useMemo(() => new Quaternion(), []);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh || !matrix) return;
    const t = item.p.t;
    seeds.forEach((sd, i) => {
      const d = sd.v * t * 0.55;
      p.set(Math.cos(sd.a) * d, 0.08 + sd.up * t * 0.5 - 1.6 * t * t * 0.5, Math.sin(sd.a) * d).applyMatrix4(
        matrix,
      );
      s.setScalar(t <= 0 ? 0.0001 : Math.max(0.0001, 1 - t));
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[sparkGeo, structureMaterial('glow'), SPARKS]} frustumCulled={false} />
  );
}

const columnGeo = new CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0);

function LevelUp({ item, c }: { item: Extract<FxItem, { kind: 'levelUp' }>; c: Ctx }) {
  const matrix = useSlotMatrix(item, c);
  const ring = useRef<Mesh>(null);
  const column = useRef<Mesh>(null);
  const ringMat = useGlowBasic(scene.highlight.select);
  const colMat = useGlowBasic(scene.highlight.select);
  const radius = levelRingRadius(item.type, Math.max(0, item.level - 1));
  const ringGeo = useMemo(() => levelRingGeometry(radius), [radius]);
  const foot = structureFootprint(item.type);
  const k = useMemo(() => new Vector3(), []);
  useFrame(() => {
    if (!matrix || !ring.current || !column.current) return;
    const t = item.p.t;
    matrix.decompose(ring.current.position, ring.current.quaternion, ring.current.scale);
    ring.current.scale.multiplyScalar(1 + (1 - Math.min(1, t * 1.6)) * 0.9);
    ringMat.opacity = t <= 0 ? 0 : Math.min(1, 2 * (1 - t));
    matrix.decompose(column.current.position, column.current.quaternion, column.current.scale);
    // Coluna de luz breve (UX_SPEC 6): sobe rápido e some; larga o bastante para ler de longe.
    const rise = Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5);
    column.current.scale.multiply(k.set(foot * 1.15, 2.6 * rise, foot * 1.15));
    colMat.opacity = 0.8 * Math.sin(t * Math.PI);
  });
  return (
    <group>
      <mesh ref={ring} geometry={ringGeo} material={ringMat} renderOrder={3} />
      <mesh ref={column} geometry={columnGeo} material={colMat} renderOrder={3} />
    </group>
  );
}

const idleGeo = new RingGeometry(0.42, 0.5, 48).rotateX(-Math.PI / 2);

function Idle({ item, c }: { item: Extract<FxItem, { kind: 'idle' }>; c: Ctx }) {
  const matrix = useSlotMatrix(item, c);
  const ref = useRef<Mesh>(null);
  const mat = useGlowBasic(scene.fx.idle);
  useFrame(() => {
    if (!matrix || !ref.current) return;
    const t = item.p.t;
    matrix.decompose(ref.current.position, ref.current.quaternion, ref.current.scale);
    ref.current.position.y += 0.02;
    ref.current.scale.multiplyScalar(0.9 + t * 0.4);
    mat.opacity = Math.max(0, Math.sin(t * Math.PI * 4)) * 0.9;
  });
  return <mesh ref={ref} geometry={idleGeo} material={mat} renderOrder={3} />;
}

// ── Tokens e cofre ───────────────────────────────────────────────────────────

const VAULT_HEIGHT = 1.5;

function anchorPoint(a: FxAnchor, c: Ctx): Vector3 | null {
  switch (a.kind) {
    case 'hex': {
      const h = c.byKey.get(a.key);
      return h ? new Vector3(h.world.x, TILE_TOP_Y + 0.08, h.world.z) : null;
    }
    case 'tray': {
      const pl = c.players[a.player];
      const tray = pl ? c.layout.boards[pl.boardId]?.tray : undefined;
      if (!pl || !tray) return null;
      const p = trayStockPoint(tray, a.resource, pl.resources[a.resource]);
      return new Vector3(p.x, p.y + 0.02, p.z);
    }
    case 'vault':
      return new Vector3(c.layout.centroid.x, VAULT_HEIGHT, c.layout.centroid.z);
  }
}

function Token({ item, c }: { item: Extract<FxItem, { kind: 'token' }>; c: Ctx }) {
  // Pontas fixadas na montagem: a pilha muda de altura enquanto o token voa.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ends = useMemo(() => ({ a: anchorPoint(item.from, c), b: anchorPoint(item.to, c) }), [item.id]);
  const ref = useRef<Mesh>(null);
  const shape = palette.resource[item.resource].shape;
  const ctrl = useMemo(() => {
    const { a, b } = ends;
    if (!a || !b) return null;
    const mid = a.clone().lerp(b, 0.5);
    mid.y = Math.max(a.y, b.y) + 0.5 + a.distanceTo(b) * 0.16;
    return mid;
  }, [ends]);
  const spinAxis = useMemo(() => new Vector3(1, 0, 0.4).normalize(), []);
  const p0 = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const mesh = ref.current;
    const { a, b } = ends;
    if (!mesh || !a || !b || !ctrl) return;
    const t = item.p.t;
    const u = 1 - t;
    p0.copy(a)
      .multiplyScalar(u * u)
      .addScaledVector(ctrl, 2 * u * t)
      .addScaledVector(b, t * t);
    mesh.position.copy(p0);
    mesh.quaternion.setFromAxisAngle(spinAxis, t * Math.PI * 2);
    mesh.visible = t > 0 && t < 1;
  });
  return (
    <mesh
      ref={ref}
      geometry={tokenGeometry(shape)}
      material={tokenMaterial(item.resource)}
      castShadow
      visible={false}
    />
  );
}

function Vault({ item, c }: { item: Extract<FxItem, { kind: 'vault' }>; c: Ctx }) {
  const ref = useRef<Mesh>(null);
  const base = useMemo(() => [tokenMaterial('gold')], []);
  const [mat] = useFadeMaterials(base, true);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh || !mat) return;
    const { t, spin } = item.p;
    mesh.position.set(c.layout.centroid.x, VAULT_HEIGHT - 0.12, c.layout.centroid.z);
    mesh.rotation.set(Math.PI / 2 - 0.35, spin, 0, 'YXZ');
    mesh.scale.setScalar(3.2 * (0.6 + 0.4 * Math.sin(Math.min(1, t * 2) * Math.PI * 0.5)));
    const o = Math.sin(t * Math.PI);
    mat.opacity = o;
    const sm = mat as MeshStandardMaterial;
    sm.emissive.set(scene.fx.vault);
    sm.emissiveIntensity = 0.35 * o * GLOW_INTENSITY;
  });
  return <mesh ref={ref} geometry={tokenGeometry('octagon')} material={mat} renderOrder={4} />;
}

// ── Raiz ─────────────────────────────────────────────────────────────────────

function FxView({ item, c }: { item: FxItem; c: Ctx }) {
  switch (item.kind) {
    case 'tileFlip':
      return <TileFlip item={item} c={c} />;
    case 'tileTilt':
      return <TileTilt item={item} c={c} />;
    case 'dust':
      return <Dust item={item} c={c} />;
    case 'scan':
      return <Scan item={item} c={c} />;
    case 'structure':
      return <StructureFx item={item} c={c} />;
    case 'sparks':
      return <Sparks item={item} c={c} />;
    case 'levelUp':
      return <LevelUp item={item} c={c} />;
    case 'idle':
      return <Idle item={item} c={c} />;
    case 'token':
      return <Token item={item} c={c} />;
    case 'vault':
      return <Vault item={item} c={c} />;
    case 'envelope':
      return <EnvelopeFx item={item} c={c} />;
    case 'cardFly':
      return <CardFlyFx item={item} c={c} />;
  }
}

interface FxProps {
  hexes: readonly SceneHex[];
  players: readonly ScenePlayer[];
  layout: TableLayout;
  facing: readonly number[];
  textureSize: number;
  reducedMotion: boolean;
}

export function Fx({ hexes, players, layout, facing, textureSize, reducedMotion }: FxProps) {
  const items = useFxStore((s) => s.items);
  const byKey = useMemo(() => new Map(hexes.map((h) => [h.key, h])), [hexes]);
  const c = useMemo<Ctx>(
    () => ({ byKey, players, layout, facing, textureSize, reduced: reducedMotion }),
    [byKey, players, layout, facing, textureSize, reducedMotion],
  );
  return (
    <group>
      {items.map((item) => (
        <FxView key={item.id} item={item} c={c} />
      ))}
    </group>
  );
}
