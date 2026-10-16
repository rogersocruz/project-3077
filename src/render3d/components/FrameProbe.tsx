/**
 * Mede FPS (média de meio segundo) e avisa quando a cena já desenhou alguns quadros
 * (`data-scene-ready` no <body>) — usado pelo contador da tela e pelo Playwright.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useSceneStore } from '../sceneStore';

const READY_AFTER_FRAMES = 12;

export function FrameProbe() {
  const setFps = useSceneStore((s) => s.setFps);
  const acc = useRef({ frames: 0, time: 0, total: 0 });

  useEffect(() => {
    delete document.body.dataset.sceneReady;
    return () => {
      delete document.body.dataset.sceneReady;
    };
  }, []);

  useFrame((_, dt) => {
    const a = acc.current;
    a.frames++;
    a.total++;
    a.time += dt;
    if (a.total === READY_AFTER_FRAMES) document.body.dataset.sceneReady = '1';
    if (a.time >= 0.5) {
      setFps(Math.round(a.frames / a.time));
      a.frames = 0;
      a.time = 0;
    }
  });
  return null;
}
