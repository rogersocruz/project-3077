/**
 * Câmera (UX_SPEC 4–5): órbita com botão do meio/direito, zoom na roda (em direção ao
 * cursor), pan com WASD/setas, pitch limitado a 25°–80°, zoom do planeta inteiro a um
 * tile, foco rápido por jogador (1–6), Espaço = meu tabuleiro, Home = visão geral.
 * Transições suaves; instantâneas com movimento reduzido.
 */
import { CameraControls, CameraControlsImpl } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Box3, Vector3 } from 'three';
import type { KeyMap } from '../../settings';
import { CAMERA, TILE_TOP_Y } from '../constants';
import { cameraPosition, type CameraPose, hexFocus, type TableLayout } from '../layout';
import type { SceneHex } from '../model';
import { type FocusTarget, useSceneStore } from '../sceneStore';

const { ACTION } = CameraControlsImpl;

interface Props {
  layout: TableLayout;
  hexes: readonly SceneHex[];
  keys: KeyMap;
  smoothTime: number;
  invertOrbit: boolean;
  reducedMotion: boolean;
}

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
  );
}

export function CameraRig({ layout, hexes, keys, smoothTime, invertOrbit, reducedMotion }: Props) {
  const ref = useRef<CameraControlsImpl>(null);
  const pressed = useRef(new Set<string>());
  const focus = useSceneStore((s) => s.focus);
  const requestFocus = useSceneStore((s) => s.requestFocus);
  const localPlayer = useSceneStore((s) => s.localPlayer);

  const poseFor = (t: FocusTarget): CameraPose | null => {
    if (t.kind === 'overview') return layout.overview;
    if (t.kind === 'board') return layout.boards[t.boardId]?.focus ?? null;
    const h = hexes.find((x) => x.key === t.key);
    return h ? hexFocus(layout, h.boardId, h.world) : null;
  };

  // Limites: pitch, zoom, área de pan (a mesa).
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.minPolarAngle = CAMERA.minPolar;
    c.maxPolarAngle = CAMERA.maxPolar;
    c.minDistance = CAMERA.minDistance;
    c.maxDistance = layout.radius * 3.2;
    c.smoothTime = reducedMotion ? 0 : smoothTime;
    c.draggingSmoothTime = reducedMotion ? 0 : 0.08;
    c.dollyToCursor = true;
    c.azimuthRotateSpeed = invertOrbit ? -1 : 1;
    c.polarRotateSpeed = invertOrbit ? -1 : 1;
    c.mouseButtons.left = ACTION.NONE;
    c.mouseButtons.middle = ACTION.ROTATE;
    c.mouseButtons.right = ACTION.ROTATE;
    c.mouseButtons.wheel = ACTION.DOLLY;
    const r = layout.radius * 1.05;
    const { x, z } = layout.centroid;
    c.setBoundary(new Box3(new Vector3(x - r, -1, z - r), new Vector3(x + r, 4, z + r)));
  }, [layout, smoothTime, invertOrbit, reducedMotion]);

  // Pedidos de foco (teclas, UI, URL de captura).
  useEffect(() => {
    const c = ref.current;
    if (!c || !focus) return;
    const pose = poseFor(focus.target);
    if (!pose) return;
    const p = cameraPosition(pose, TILE_TOP_Y);
    const animate = !focus.instant && !reducedMotion;
    void c.setLookAt(p.x, p.y, p.z, pose.target.x, TILE_TOP_Y, pose.target.z, animate);
    // poseFor depende só de layout/hexes, já cobertos pelo pedido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  // Teclado.
  useEffect(() => {
    const has = (list: string[], code: string) => list.includes(code);
    const down = (e: KeyboardEvent) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const code = e.code;
      if (has(keys.focusMine, code)) {
        e.preventDefault();
        requestFocus({ kind: 'board', boardId: localPlayer });
        return;
      }
      const n = keys.focusPlayer.indexOf(code);
      if (n >= 0 && n < layout.boards.length) {
        requestFocus({ kind: 'board', boardId: n });
        return;
      }
      if (has(keys.overview, code)) {
        requestFocus({ kind: 'overview' });
        return;
      }
      const pan = [keys.panForward, keys.panBack, keys.panLeft, keys.panRight].some((l) => has(l, code));
      if (pan) {
        e.preventDefault();
        pressed.current.add(code);
      }
    };
    const up = (e: KeyboardEvent) => pressed.current.delete(e.code);
    const clear = () => pressed.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, [keys, layout, localPlayer, requestFocus]);

  useFrame((_, dt) => {
    const c = ref.current;
    if (!c) return;
    if (useSceneStore.getState().orbit && !reducedMotion)
      void c.rotate(Math.min(dt, 0.05) * CAMERA.orbitSpeed, 0, false);
    if (pressed.current.size === 0) return;
    const any = (l: string[]) => l.some((k) => pressed.current.has(k));
    const fwd = (any(keys.panForward) ? 1 : 0) - (any(keys.panBack) ? 1 : 0);
    const side = (any(keys.panRight) ? 1 : 0) - (any(keys.panLeft) ? 1 : 0);
    // Velocidade proporcional à distância: o pan "sente" igual em qualquer zoom.
    const step = Math.min(dt, 0.05) * CAMERA.panSpeed * (c.distance / 12);
    if (side) void c.truck(side * step, 0, false);
    if (fwd) void c.forward(fwd * step, false);
  });

  return <CameraControls ref={ref} makeDefault />;
}
