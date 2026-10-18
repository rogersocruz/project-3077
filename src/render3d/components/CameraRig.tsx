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
import { type ControlSettings, DEFAULT_CONTROLS, type KeyMap } from '../../settings';
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
  /** UX_SPEC 3.4: sensibilidades, eixo vertical invertido e câmera pelas bordas. */
  controls?: ControlSettings;
}

/** Faixa da borda da tela (px) que move a câmera com edgePan. */
const EDGE = 18;

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
  );
}

export function CameraRig({ layout, hexes, keys, smoothTime, invertOrbit, reducedMotion, controls }: Props) {
  const ref = useRef<CameraControlsImpl>(null);
  const ctl = controls ?? DEFAULT_CONTROLS;
  const mouse = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!ctl.edgePan) return;
    const move = (e: MouseEvent) => (mouse.current = { x: e.clientX, y: e.clientY });
    const leave = () => (mouse.current = null);
    window.addEventListener('mousemove', move);
    document.addEventListener('mouseleave', leave);
    return () => {
      window.removeEventListener('mousemove', move);
      document.removeEventListener('mouseleave', leave);
      mouse.current = null;
    };
  }, [ctl.edgePan]);
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
    c.azimuthRotateSpeed = (invertOrbit ? -1 : 1) * ctl.orbitSpeed;
    c.polarRotateSpeed = (invertOrbit !== ctl.invertY ? -1 : 1) * ctl.orbitSpeed;
    c.dollySpeed = ctl.zoomSpeed;
    c.truckSpeed = ctl.panSpeed * 2;
    c.mouseButtons.left = ACTION.NONE;
    c.mouseButtons.middle = ACTION.ROTATE;
    c.mouseButtons.right = ACTION.ROTATE;
    c.mouseButtons.wheel = ACTION.DOLLY;
    const r = layout.radius * 1.05;
    const { x, z } = layout.centroid;
    c.setBoundary(new Box3(new Vector3(x - r, -1, z - r), new Vector3(x + r, 4, z + r)));
  }, [
    layout,
    smoothTime,
    invertOrbit,
    reducedMotion,
    ctl.orbitSpeed,
    ctl.zoomSpeed,
    ctl.panSpeed,
    ctl.invertY,
  ]);

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

  // Tremor de câmera (UX_SPEC 6, evento sísmico): ~0,6 s de sacudida que decai.
  const shakeNonce = useSceneStore((s) => s.shakeNonce);
  const shakeLeft = useRef(0);
  useEffect(() => {
    if (shakeNonce > 0) shakeLeft.current = 0.6;
  }, [shakeNonce]);

  useFrame((_, dt) => {
    const c = ref.current;
    if (!c) return;
    if (shakeLeft.current > 0) {
      shakeLeft.current = Math.max(0, shakeLeft.current - dt);
      // Oscilação determinística (nada de Math.random fora de rng.ts).
      const a = 0.02 * (shakeLeft.current / 0.6);
      const t = shakeLeft.current * 60;
      void c.rotate(Math.sin(t) * a, Math.cos(t * 1.3) * a, false);
    }
    if (useSceneStore.getState().orbit && !reducedMotion)
      void c.rotate(Math.min(dt, 0.05) * CAMERA.orbitSpeed, 0, false);
    const any = (l: string[]) => l.some((k) => pressed.current.has(k));
    let fwd = (any(keys.panForward) ? 1 : 0) - (any(keys.panBack) ? 1 : 0);
    let side = (any(keys.panRight) ? 1 : 0) - (any(keys.panLeft) ? 1 : 0);
    // Câmera pelas bordas da tela (UX_SPEC 3.4).
    const m = mouse.current;
    if (m) {
      if (m.x < EDGE) side = -1;
      else if (m.x > window.innerWidth - EDGE) side = 1;
      if (m.y < EDGE) fwd = 1;
      else if (m.y > window.innerHeight - EDGE) fwd = -1;
    }
    if (!fwd && !side) return;
    // Velocidade proporcional à distância: o pan "sente" igual em qualquer zoom.
    const step = Math.min(dt, 0.05) * CAMERA.panSpeed * ctl.panSpeed * (c.distance / 12);
    if (side) void c.truck(side * step, 0, false);
    if (fwd) void c.forward(fwd * step, false);
  });

  return <CameraControls ref={ref} makeDefault />;
}
