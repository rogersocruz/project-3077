/**
 * Pós-processamento (ART_DIRECTION 8): bloom leve só em emissivos, vinheta suave,
 * desfoque nas bordas da mesa (tilt-shift barato no lugar da profundidade de campo),
 * SMAA. Tudo desligável nas configurações.
 */
import {
  Bloom,
  EffectComposer,
  FXAA,
  SMAA,
  TiltShift2,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type { ReactElement } from 'react';
import type { AdaptedPost } from '../adaptive';

export function Post({ post }: { post: AdaptedPost }) {
  const effects: ReactElement[] = [];
  // Limiar acima de 1: só o que é emissivo (intensidade > 1) brilha.
  if (post.bloom)
    effects.push(
      <Bloom
        key="bloom"
        mipmapBlur
        luminanceThreshold={1}
        luminanceSmoothing={0.2}
        intensity={0.75}
        radius={0.7}
        levels={6}
        // Meia resolução: o brilho é borrado de qualquer jeito, e custa 1/4.
        resolutionScale={0.5}
      />,
    );
  if (post.tiltShift)
    effects.push(
      <TiltShift2 key="tilt" blur={0.08} taper={0.65} samples={6} start={[0.5, 0.0]} end={[0.5, 1.0]} />,
    );
  effects.push(<ToneMapping key="tone" mode={ToneMappingMode.ACES_FILMIC} />);
  if (post.vignette) effects.push(<Vignette key="vignette" offset={0.28} darkness={0.62} />);
  if (post.smaa) effects.push(<SMAA key="smaa" />);
  if (post.fxaa) effects.push(<FXAA key="fxaa" />);
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {effects}
    </EffectComposer>
  );
}
