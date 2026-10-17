/**
 * npm run assets:build — processa os ícones aprovados (assets-src/icons.manifest.json)
 * de assets-src/_inbox/ para public/assets/icons/<id>.svg. Idempotente.
 *
 * Tratamento de cada SVG do game-icons (formato fixo: quadrado de fundo + 1 path branco):
 * tira o fundo, troca a cor por currentColor, sem ids/estilos, viewBox 0 0 24 24, nome =
 * id do jogo. Formato diferente falha (não adivinha). Gera também:
 * - assets/credits.json (fonte, autor, licença, sha256 do arquivo final e do original);
 * - assets/icon-map.json (id → arquivo);
 * - src/ui/icons/gameIcons.generated.ts (o path de cada ícone para o SVG das cartas,
 *   que é rasterizado para textura 3D e não pode depender de arquivo externo).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const inbox = join(root, 'assets-src', '_inbox');
const outDir = join(root, 'public', 'assets', 'icons');

interface ManifestIcon {
  id: string;
  inbox: string;
  name: string;
  source: string;
  download: string;
  author: string;
  license: string;
  licenseUrl: string;
  downloadedAt: string;
}

const manifest = JSON.parse(readFileSync(join(root, 'assets-src', 'icons.manifest.json'), 'utf8')) as {
  icons: ManifestIcon[];
};
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const SOURCE_BOX = 512;
const TARGET_BOX = 24;

function iconPath(svg: string, file: string): string {
  const box = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  if (!box || Number(box[1]) !== SOURCE_BOX || Number(box[2]) !== SOURCE_BOX)
    throw new Error(`${file}: viewBox diferente de 0 0 ${SOURCE_BOX} ${SOURCE_BOX}`);
  const paths = [...svg.matchAll(/<path([^>]*)\/>/g)].map((m) => m[1] ?? '');
  const tags = [...svg.matchAll(/<([a-zA-Z]+)/g)].map((m) => m[1]);
  if (tags.some((t) => t !== 'svg' && t !== 'path') || paths.length !== 2)
    throw new Error(`${file}: formato inesperado (${tags.join(',')}) — revisar à mão`);
  if (!/d="M0 0h512v512H0z"/.test(paths[0] ?? '')) throw new Error(`${file}: sem o quadrado de fundo`);
  const d = /\sd="([^"]+)"/.exec(paths[1] ?? '')?.[1];
  if (!d || !/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/.test(d)) throw new Error(`${file}: path inválido`);
  return d;
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const credits = [];
const map: Record<string, string> = {};
const generated: Record<string, string> = {};
for (const icon of [...manifest.icons].sort((a, b) => a.id.localeCompare(b.id))) {
  const original = readFileSync(join(inbox, icon.inbox), 'utf8');
  const d = iconPath(original, icon.inbox);
  const scale = TARGET_BOX / SOURCE_BOX;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TARGET_BOX} ${TARGET_BOX}">` +
    `<path fill="currentColor" transform="scale(${scale})" d="${d}"/></svg>\n`;
  const file = `assets/icons/${icon.id}.svg`;
  writeFileSync(join(root, 'public', file), svg);
  map[icon.id] = file;
  generated[icon.id] = d;
  credits.push({
    id: icon.id,
    file,
    name: icon.name,
    source: icon.source,
    download: icon.download,
    author: icon.author,
    license: icon.license,
    licenseUrl: icon.licenseUrl,
    sha256: sha256(svg),
    sourceSha256: sha256(original),
    downloadedAt: icon.downloadedAt,
  });
}

// Nada a mais em public/assets/icons além do que o manifesto aprovou.
const extra = readdirSync(outDir).filter((f) => !Object.values(map).includes(`assets/icons/${f}`));
if (extra.length) throw new Error(`arquivos sem manifesto: ${extra.join(', ')}`);

mkdirSync(join(root, 'assets'), { recursive: true });
writeFileSync(join(root, 'assets', 'credits.json'), JSON.stringify({ assets: credits }, null, 2) + '\n');
writeFileSync(join(root, 'assets', 'icon-map.json'), JSON.stringify(map, null, 2) + '\n');

const ts = [
  '// GERADO por `npm run assets:build` — não editar. Fonte: assets-src/icons.manifest.json.',
  '// Ícones de game-icons.net (CC BY 3.0); autores e licença em assets/credits.json.',
  '',
  `/** Lado do quadrado de coordenadas dos paths. */`,
  `export const GAME_ICON_BOX = ${SOURCE_BOX};`,
  '',
  `export const GAME_ICON_PATHS = {`,
  ...Object.entries(generated).map(([id, d]) => `  '${id}': '${d}',`),
  `} as const;`,
  '',
  'export type GameIconId = keyof typeof GAME_ICON_PATHS;',
  '',
].join('\n');
mkdirSync(join(root, 'src', 'ui', 'icons'), { recursive: true });
writeFileSync(join(root, 'src', 'ui', 'icons', 'gameIcons.generated.ts'), ts);

console.log(`assets:build ok: ${credits.length} ícones → public/assets/icons/`);
