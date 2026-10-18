/**
 * npm run audio:manifest — gera public/audio/audio-manifest.json a partir de src/audio/sounds.ts:
 * cada som e faixa de música com canal, descrição (UX_SPEC 6 / ART_DIRECTION 9) e o arquivo
 * esperado para a troca futura. Até o arquivo existir, o jogo usa o substituto (sfxr próprio /
 * trilha procedural).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MUSIC_TRACKS, SOUNDS } from '../src/audio/sounds';

const out = join(import.meta.dirname, '..', 'public', 'audio');
mkdirSync(out, { recursive: true });
const manifest = {
  _meta: {
    note: 'Gerado por npm run audio:manifest. Substitua o placeholder pelo arquivo .ogg do caminho indicado.',
  },
  sounds: Object.entries(SOUNDS).map(([id, s]) => ({
    id,
    channel: s.channel,
    brief: s.brief,
    caption: s.caption,
    file: `audio/sfx/${id}.ogg`,
    placeholder: 'sfxr',
  })),
  music: Object.entries(MUSIC_TRACKS).map(([id, brief]) => ({
    id,
    brief,
    file: `audio/music/${id}.ogg`,
    placeholder: 'procedural',
  })),
};
writeFileSync(join(out, 'audio-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`audio-manifest.json: ${manifest.sounds.length} sons, ${manifest.music.length} faixas`);
