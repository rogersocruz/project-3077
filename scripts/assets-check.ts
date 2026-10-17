/**
 * npm run assets:check — falha (código 1) se:
 * - algum id que o jogo usa não tiver ícone (recursos de resources.json e as 7 categorias
 *   de carta de ART_DIRECTION 2.2);
 * - algum arquivo em public/assets não estiver em assets/credits.json;
 * - algum sha256 não bater, ou faltar campo obrigatório no crédito;
 * - alguma licença fora da lista aceita.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const errors: string[] = [];
const read = <T>(p: string): T => JSON.parse(readFileSync(join(root, p), 'utf8')) as T;

const ACCEPTED = new Set(['CC0-1.0', 'MIT', 'ISC', 'Apache-2.0', 'CC-BY-3.0', 'CC-BY-4.0']);
const FIELDS = ['id', 'file', 'source', 'author', 'license', 'licenseUrl', 'sha256', 'downloadedAt'] as const;
/** ART_DIRECTION 2.2: categorias de carta (Evento entra com a Fase 6, Tesouro com o baralho do Tesouro). */
const CARD_CATEGORIES = ['tech', 'delivered', 'own', 'contract', 'relic', 'event', 'treasure'];

type Credit = Record<(typeof FIELDS)[number], string>;
const credits = existsSync(join(root, 'assets/credits.json'))
  ? read<{ assets: Credit[] }>('assets/credits.json').assets
  : [];
const map = existsSync(join(root, 'assets/icon-map.json'))
  ? read<Record<string, string>>('assets/icon-map.json')
  : {};

const needed = [
  ...read<{ id: string }[]>('data/resources.json').map((r) => `resource-${r.id}`),
  ...CARD_CATEGORIES.map((c) => `card-${c}`),
];
for (const id of needed) if (!map[id]) errors.push(`sem ícone: ${id}`);

const byFile = new Map(credits.map((c) => [c.file, c]));
for (const c of credits) {
  for (const f of FIELDS) if (!c[f]) errors.push(`credits.json: ${c.id ?? '?'} sem "${f}"`);
  if (!ACCEPTED.has(c.license)) errors.push(`credits.json: ${c.id} com licença não aceita (${c.license})`);
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
for (const abs of walk(join(root, 'public', 'assets'))) {
  const file = relative(join(root, 'public'), abs).split('\\').join('/');
  const credit = byFile.get(file);
  if (!credit) {
    errors.push(`sem crédito: public/${file}`);
    continue;
  }
  const hash = createHash('sha256').update(readFileSync(abs)).digest('hex');
  if (hash !== credit.sha256) errors.push(`sha256 não bate: public/${file}`);
}
for (const c of credits)
  if (!existsSync(join(root, 'public', c.file))) errors.push(`arquivo ausente: public/${c.file}`);
for (const [id, file] of Object.entries(map))
  if (!byFile.has(file)) errors.push(`icon-map: ${id} → ${file} sem crédito`);

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\nassets:check falhou: ${errors.length} problema(s).`);
  process.exit(1);
}
console.log(`assets:check ok: ${credits.length} arquivos com crédito, ${needed.length} ids cobertos.`);
