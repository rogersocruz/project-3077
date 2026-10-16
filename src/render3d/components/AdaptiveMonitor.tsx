/** Mede o FPS em janelas e sobe/desce o degrau de qualidade (adaptive.ts). */
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { INITIAL_MONITOR, MONITOR, type MonitorState, nextMonitorState } from '../adaptive';

export function AdaptiveMonitor({ onTier }: { onTier: (tier: number) => void }) {
  const state = useRef<MonitorState>(INITIAL_MONITOR);
  const acc = useRef({ frames: 0, time: 0 });
  useFrame((_, dt) => {
    const a = acc.current;
    a.frames++;
    a.time += dt;
    if (a.time < MONITOR.window) return;
    const before = state.current.tier;
    state.current = nextMonitorState(state.current, a.frames / a.time);
    a.frames = 0;
    a.time = 0;
    if (state.current.tier !== before) onTier(state.current.tier);
  });
  return null;
}
