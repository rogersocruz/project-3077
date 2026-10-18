/**
 * Limite de FPS (UX_SPEC 3.1): com o Canvas em frameloop "never", avança um quadro só quando
 * passou 1/fps desde o último.
 */
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

export function FpsLimiter({ fps }: { fps: number }) {
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const step = 1000 / fps;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      // Pequena folga para não perder quadro por arredondamento do vsync.
      if (t - last < step - 1) return;
      last = t;
      advance(t / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [advance, fps]);
  return null;
}
