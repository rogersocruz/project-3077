/**
 * npm run data:check — valida data/*.json contra os esquemas Zod e as referências
 * cruzadas, e confere todo effectId contra o registro do motor (cartas: handler e
 * parâmetros; eventos/hazards/facções: lista de efeitos conhecidos). Lê do disco (pega
 * também erro de sintaxe JSON). Sai com código 1 se houver qualquer erro; avisos não falham.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_FILES, type DataFileName } from '../src/data/schemas';
import { type DataIssue, formatIssue, type RawDataFiles, validateGameData } from '../src/data/validate';
import { effectIssues } from '../src/engine/effects/registry';

const dataDir = join(import.meta.dirname, '..', 'data');
const raw: Partial<RawDataFiles> = {};
const syntaxErrors: string[] = [];

for (const file of Object.keys(DATA_FILES) as DataFileName[]) {
  try {
    raw[file] = JSON.parse(readFileSync(join(dataDir, file), 'utf8'));
  } catch (e) {
    syntaxErrors.push(`ERRO  ${file}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

if (syntaxErrors.length) {
  console.error(syntaxErrors.join('\n'));
  console.error(`\ndata:check falhou: ${syntaxErrors.length} arquivo(s) ilegível(is).`);
  process.exit(1);
}

const { data, issues } = validateGameData(raw as RawDataFiles);
if (data) {
  for (const e of effectIssues(data)) {
    issues.push({ severity: 'error', file: e.file, path: e.path, message: e.message } satisfies DataIssue);
  }
}
const errors = issues.filter((i) => i.severity === 'error');
const warnings = issues.filter((i) => i.severity === 'warning');

for (const issue of [...errors, ...warnings]) {
  (issue.severity === 'error' ? console.error : console.warn)(formatIssue(issue));
}

const files = Object.keys(DATA_FILES).length;
if (errors.length) {
  console.error(
    `\ndata:check falhou: ${errors.length} erro(s), ${warnings.length} aviso(s) em ${files} arquivos.`,
  );
  process.exit(1);
}
console.log(`\ndata:check ok: ${files} arquivos válidos, ${warnings.length} aviso(s).`);
