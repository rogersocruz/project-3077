/**
 * A mesa é quase toda estática e a luz não se move: o mapa de sombras só é
 * redesenhado quando o conteúdo muda (e por alguns quadros depois, até texturas e
 * geometrias assentarem) — não a cada quadro. Mover a câmera não custa sombra.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';

const SETTLE_FRAMES = 30;

/** `live`: algo se mexe na mesa (efeitos da Fase 3) — redesenha a cada quadro. */
export function StaticShadows({ version, live = false }: { version: unknown; live?: boolean }) {
  const gl = useThree((s) => s.gl);
  const left = useRef(SETTLE_FRAMES);

  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);

  useEffect(() => {
    left.current = SETTLE_FRAMES;
  }, [version]);

  useFrame(() => {
    if (live) left.current = SETTLE_FRAMES;
    if (left.current <= 0) return;
    left.current--;
    gl.shadowMap.needsUpdate = true;
  });
  return null;
}
