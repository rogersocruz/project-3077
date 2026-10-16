/**
 * Efeitos 3D das cartas (UX_SPEC 6): envelope lacrado levado por um mini drone até a
 * bandeja do alvo (entrega) e da bandeja ao centro (revelação); carta voando entre
 * slots e pilhas (roubo de permanente, descarte). O diretor anima `p`; aqui só se lê.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, CylinderGeometry, type Group, type Material, Vector3 } from 'three';
import { cardAnchorPoint, type CardsFxCtx } from '../cardAnchors';
import { CARD } from '../constants';
import type { CardAnchor, FxItem } from '../fxStore';
import {
  cardEdgeMaterial,
  cardFaceMaterial,
  envelopeMaterial,
  sealMaterial,
  structureMaterial,
} from '../materials';
import { ENVELOPE } from '../trayLayout';

function bezier(a: Vector3, ctrl: Vector3, b: Vector3, t: number, out: Vector3): Vector3 {
  const u = 1 - t;
  return out
    .copy(a)
    .multiplyScalar(u * u)
    .addScaledVector(ctrl, 2 * u * t)
    .addScaledVector(b, t * t);
}

function useEnds(
  item: { readonly id: number; readonly from: CardAnchor; readonly to: CardAnchor },
  c: CardsFxCtx,
) {
  // Pontas fixadas na montagem (a bandeja não se mexe durante o voo).
  return useMemo(() => {
    const a = cardAnchorPoint(item.from, c);
    const b = cardAnchorPoint(item.to, c);
    if (!a || !b) return null;
    const ctrl = a.p.clone().lerp(b.p, 0.5);
    ctrl.y = Math.max(a.p.y, b.p.y) + 1.4 + a.p.distanceTo(b.p) * 0.12;
    return { a, b, ctrl };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);
}

const envGeo = new BoxGeometry(ENVELOPE.width, ENVELOPE.height, ENVELOPE.depth);
const sealGeo = new CylinderGeometry(0.06, 0.06, 0.012, 16).translate(0, ENVELOPE.height / 2 + 0.006, 0);
const droneBody = new BoxGeometry(0.22, 0.06, 0.14);
const rotorGeo = new CylinderGeometry(0.075, 0.075, 0.008, 14);
const armGeo = new BoxGeometry(0.36, 0.015, 0.02);
const ROTORS: readonly (readonly [number, number])[] = [
  [0.14, 0.14],
  [-0.14, 0.14],
  [0.14, -0.14],
  [-0.14, -0.14],
];

/** Clones transparentes (fade) descartados ao desmontar. */
function useFaded(base: readonly Material[]): Material[] {
  const mats = useMemo(
    () =>
      base.map((m) => {
        const c = m.clone();
        c.transparent = true;
        c.depthWrite = false;
        return c;
      }),
    [base],
  );
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  return mats;
}

export function EnvelopeFx({ item, c }: { item: Extract<FxItem, { kind: 'envelope' }>; c: CardsFxCtx }) {
  const ends = useEnds(item, c);
  const group = useRef<Group>(null);
  const drone = useRef<Group>(null);
  const base = useMemo(() => [envelopeMaterial(), sealMaterial()], []);
  const [paper, seal] = useFaded(base);
  const p = useMemo(() => new Vector3(), []);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g || !ends || !paper || !seal) return;
    const { t, open } = item.p;
    bezier(ends.a.p, ends.ctrl, ends.b.p, t, p);
    g.position.copy(p);
    // Dobra em envelope no começo; na revelação, abre e some no centro.
    const fold = Math.min(1, t / 0.12);
    const s = (0.4 + 0.6 * fold) * (1 + open * 1.5) * (1 + (ends.b.scale - 1) * t * 0.35);
    g.scale.setScalar(s);
    g.rotation.set(0, t * Math.PI * 0.5, Math.sin(t * Math.PI) * 0.25);
    paper.opacity = 1 - open;
    seal.opacity = 1 - Math.min(1, open * 2);
    g.visible = t > 0 && open < 1;
    const d = drone.current;
    if (d) {
      d.visible = t > 0.04 && t < 0.97 && open === 0;
      d.children.forEach((child, i) => {
        if (i > 1) child.rotation.y += dt * 40;
      });
    }
  });
  if (!ends) return null;
  const dark = structureMaterial('dark');
  const metal = structureMaterial('metal');
  return (
    <group ref={group} visible={false}>
      <mesh geometry={envGeo} material={paper} castShadow renderOrder={4} />
      <mesh geometry={sealGeo} material={seal} renderOrder={5} />
      <group ref={drone} position={[0, 0.32, 0]}>
        <mesh geometry={droneBody} material={dark} castShadow />
        <mesh geometry={armGeo} material={metal} rotation={[0, Math.PI / 4, 0]} />
        {ROTORS.map(([x, z]) => (
          <mesh key={`${x}${z}`} geometry={rotorGeo} material={metal} position={[x, 0.04, z]} />
        ))}
      </group>
    </group>
  );
}

const cardGeo = new BoxGeometry(CARD.width, CARD.thickness, CARD.height);

export function CardFlyFx({ item, c }: { item: Extract<FxItem, { kind: 'cardFly' }>; c: CardsFxCtx }) {
  const ends = useEnds(item, c);
  const ref = useRef<Group>(null);
  const p = useMemo(() => new Vector3(), []);
  const mats = useMemo(() => {
    const edge = cardEdgeMaterial();
    return [edge, edge, cardFaceMaterial(item.card, item.category), edge, edge, edge];
  }, [item.card, item.category]);
  useFrame(() => {
    const g = ref.current;
    if (!g || !ends) return;
    const t = item.p.t;
    bezier(ends.a.p, ends.ctrl, ends.b.p, t, p);
    g.position.copy(p);
    g.scale.setScalar(ends.a.scale + (ends.b.scale - ends.a.scale) * t);
    g.rotation.set(Math.sin(t * Math.PI) * -0.5, t * Math.PI * 2, 0);
    g.visible = t > 0 && t < 1;
  });
  if (!ends) return null;
  return (
    <group ref={ref} visible={false}>
      <mesh geometry={cardGeo} material={mats} castShadow renderOrder={4} />
    </group>
  );
}
