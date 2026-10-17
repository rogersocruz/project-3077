/**
 * Validação completa de data/*.json: esquema Zod de cada arquivo + checagens
 * cruzadas entre arquivos (referências, ids únicos, valores duplicados coerentes).
 * Puro: recebe os objetos já lidos, devolve a lista de problemas.
 */
import type { z } from 'zod';
import { DATA_FILES, type DataFileName, type GameData, RESOURCE_IDS } from './schemas';

export type Severity = 'error' | 'warning';

export interface DataIssue {
  severity: Severity;
  file: DataFileName;
  /** Caminho do campo, ex.: `[12].cost.resources.gld` */
  path: string;
  message: string;
}

export interface ValidationResult {
  data: GameData | null;
  issues: DataIssue[];
}

export type RawDataFiles = Record<DataFileName, unknown>;

export function formatPath(path: readonly PropertyKey[]): string {
  return path
    .map((seg) => {
      if (typeof seg === 'number') return `[${seg}]`;
      const s = String(seg);
      return /^[A-Za-z_$][\w$]*$/.test(s) ? `.${s}` : `[${JSON.stringify(s)}]`;
    })
    .join('');
}

export function formatIssue(issue: DataIssue): string {
  const tag = issue.severity === 'error' ? 'ERRO' : 'AVISO';
  return `${tag}  ${issue.file}${issue.path}: ${issue.message}`;
}

export function validateGameData(raw: RawDataFiles): ValidationResult {
  const issues: DataIssue[] = [];
  const parsed: Partial<Record<keyof GameData, unknown>> = {};

  for (const file of Object.keys(DATA_FILES) as DataFileName[]) {
    const schema: z.ZodType = DATA_FILES[file];
    const result = schema.safeParse(raw[file]);
    if (result.success) {
      parsed[file.replace(/\.json$/, '') as keyof GameData] = result.data;
      continue;
    }
    for (const issue of result.error.issues) {
      // Chave desconhecida: aponta o caminho até a própria chave, uma entrada por chave.
      if (issue.code === 'unrecognized_keys') {
        for (const key of issue.keys) {
          issues.push({
            severity: 'error',
            file,
            path: formatPath([...issue.path, key]),
            message: `campo desconhecido "${key}"`,
          });
        }
      } else {
        issues.push({ severity: 'error', file, path: formatPath(issue.path), message: issue.message });
      }
    }
  }

  if (issues.some((i) => i.severity === 'error')) return { data: null, issues };

  const data = parsed as GameData;
  crossCheck(data, issues);
  return { data: issues.some((i) => i.severity === 'error') ? null : data, issues };
}

function crossCheck(d: GameData, issues: DataIssue[]): void {
  const err = (file: DataFileName, path: string, message: string) =>
    issues.push({ severity: 'error', file, path, message });
  const warn = (file: DataFileName, path: string, message: string) =>
    issues.push({ severity: 'warning', file, path, message });

  const uniqueIds = (file: DataFileName, prefix: string, items: readonly { id: string }[]) => {
    const seen = new Map<string, number>();
    items.forEach((item, i) => {
      const first = seen.get(item.id);
      if (first !== undefined) err(file, `${prefix}[${i}].id`, `id "${item.id}" repetido (já usado em [${first}])`);
      else seen.set(item.id, i);
    });
  };

  // ── ids únicos ──
  uniqueIds('resources.json', '', d.resources);
  uniqueIds('tiles.json', '.surface', d.tiles.surface);
  uniqueIds('tiles.json', '.subsoil', d.tiles.subsoil);
  uniqueIds('tiles.json', '.sites', d.tiles.sites);
  uniqueIds('tiles.json', '.hazards', d.tiles.hazards);
  uniqueIds('structures.json', '', d.structures);
  uniqueIds('cards.json', '', d.cards);
  uniqueIds('events.json', '', d.events);
  uniqueIds('factions.json', '', d.factions);
  uniqueIds('treaties.json', '.pacts', d.treaties.pacts);
  uniqueIds('treaties.json', '.templates', d.treaties.templates);

  const surfaceIds = new Set(d.tiles.surface.map((t) => t.id));
  const terrainIds = new Set([
    ...surfaceIds,
    ...d.tiles.sites.map((s) => s.id),
    ...d.tiles.hazards.map((h) => h.id),
  ]);
  const structureIds = new Set(d.structures.map((s) => s.id));

  // Superfície, sítios e hazards compartilham o espaço de ids de terreno.
  const terrainSeen = new Set<string>();
  for (const [group, list] of [
    ['surface', d.tiles.surface],
    ['sites', d.tiles.sites],
    ['hazards', d.tiles.hazards],
  ] as const) {
    list.forEach((t, i) => {
      if (terrainSeen.has(t.id)) err('tiles.json', `.${group}[${i}].id`, `id de terreno "${t.id}" repetido`);
      terrainSeen.add(t.id);
    });
  }

  // ── resources.json ──
  for (const id of RESOURCE_IDS) {
    if (!d.resources.some((r) => r.id === id)) err('resources.json', '', `recurso "${id}" ausente`);
  }
  d.resources.forEach((r, i) => {
    if (r.value !== d.balance.costPoints[r.id]) {
      err(
        'resources.json',
        `[${i}].value`,
        `valor ${r.value} difere de balance.json costPoints.${r.id} = ${d.balance.costPoints[r.id]}`,
      );
    }
  });

  // ── tiles.json ──
  d.tiles.surface.forEach((t, i) => {
    if (t.builder !== null && !structureIds.has(t.builder)) {
      err('tiles.json', `.surface[${i}].builder`, `estrutura "${t.builder}" não existe em structures.json`);
    }
    for (const key of Object.keys(t.rangeBonus ?? {})) {
      if (!structureIds.has(key)) {
        err('tiles.json', `.surface[${i}].rangeBonus.${key}`, `estrutura "${key}" não existe`);
      }
    }
    if ((t.category === 'empty') !== (t.produces.length === 0)) {
      err('tiles.json', `.surface[${i}].produces`, 'categoria "empty" ⇔ não produz nada');
    }
  });

  // ── structures.json ──
  const drawLevels = new Set(Object.keys(d.balance.cards.universityDraw).map(Number));
  d.structures.forEach((s, i) => {
    // Fase 6 (interpretação AL): Parque também vai em hazard (Vulcão, Pântano Ácido).
    const hazardIds = new Set(d.tiles.hazards.map((h) => h.id));
    s.buildOn?.forEach((target, j) => {
      if (target !== 'surveyedSubsoil' && !surfaceIds.has(target) && !hazardIds.has(target)) {
        err('structures.json', `[${i}].buildOn[${j}]`, `terreno "${target}" não existe em tiles.json`);
      }
    });
    s.levels.forEach((lvl, j) => {
      if (lvl.drawTable !== undefined && !drawLevels.has(lvl.drawTable)) {
        err(
          'structures.json',
          `[${i}].levels[${j}].drawTable`,
          `tabela ${lvl.drawTable} não existe em balance.json cards.universityDraw`,
        );
      }
    });
  });

  const structure = (id: string) => d.structures.find((s) => s.id === id);
  const compareLevels = (id: string, field: 'yield' | 'multiplier', expected: readonly number[], src: string) => {
    const s = structure(id);
    if (!s) return err('structures.json', '', `estrutura "${id}" ausente`);
    const idx = d.structures.indexOf(s);
    const actual = s.levels.map((l) => l[field]);
    if (actual.length !== expected.length || actual.some((v, k) => v !== expected[k])) {
      err(
        'structures.json',
        `[${idx}].levels`,
        `${field} por nível [${actual.join(', ')}] difere de balance.json ${src} [${expected.join(', ')}]`,
      );
    }
  };
  compareLevels('park', 'yield', d.balance.production.parkYieldByLevel, 'production.parkYieldByLevel');
  compareLevels('quarry', 'yield', d.balance.production.quarryYieldByLevel, 'production.quarryYieldByLevel');
  const archive = structure('archive');
  if (archive) {
    const perLevel = d.balance.cards.archiveHandLimitPerLevel;
    archive.levels.forEach((lvl, j) => {
      if (lvl.handLimitBonus !== undefined && lvl.handLimitBonus !== (j + 1) * perLevel) {
        err(
          'structures.json',
          `[${d.structures.indexOf(archive)}].levels[${j}].handLimitBonus`,
          `difere de balance.json cards.archiveHandLimitPerLevel × nível = ${(j + 1) * perLevel}`,
        );
      }
    });
  }
  d.cards.forEach((c, i) => {
    if (c.effectId === 'tutor' && c.params['look'] !== d.balance.cards.tutorRevealTop) {
      err(
        'cards.json',
        `[${i}].params.look`,
        `difere de balance.json cards.tutorRevealTop = ${d.balance.cards.tutorRevealTop}`,
      );
    }
  });
  const mine = structure('mine');
  if (mine) {
    const idx = d.structures.indexOf(mine);
    if (mine.levels[0]?.multiplier !== d.balance.production.mineMultiplier) {
      err(
        'structures.json',
        `[${idx}].levels[0].multiplier`,
        `difere de balance.json production.mineMultiplier = ${d.balance.production.mineMultiplier}`,
      );
    }
    if (mine.tokens !== d.balance.production.mineTokens) {
      err(
        'structures.json',
        `[${idx}].tokens`,
        `difere de balance.json production.mineTokens = ${d.balance.production.mineTokens}`,
      );
    }
  }

  // ── cards.json ──
  const tierOfDeck = { n1: 1, n2: 2, n3: 3, treasure: null } as const;
  d.cards.forEach((c, i) => {
    if (c.tier !== tierOfDeck[c.deck]) {
      err('cards.json', `[${i}].tier`, `baralho ${c.deck} exige tier ${String(tierOfDeck[c.deck])}`);
    }
    if ((c.deck === 'treasure') !== (c.type === 'treasure' || c.type === 'relic')) {
      err('cards.json', `[${i}].type`, `tipo "${c.type}" incoerente com o baralho "${c.deck}"`);
    }
    if (c.deck === 'treasure' || c.flags?.includes('fixedCost')) return;
    const points = cardCostPoints(c.cost, d.balance.costPoints);
    const [min, max] = d.balance.tierBands[c.deck];
    if (points < min || points > max) {
      warn(
        'cards.json',
        `[${i}].cost`,
        `"${c.name}" custa ${points} pontos, fora da faixa ${c.deck} [${min}–${max}] (DECISOES_ABERTAS D8/D9)`,
      );
    }
  });

  // ── events.json ──
  d.events.forEach((e, i) => {
    e.terrainTargets.forEach((t, j) => {
      if (!terrainIds.has(t)) err('events.json', `[${i}].terrainTargets[${j}]`, `terreno "${t}" não existe em tiles.json`);
    });
  });

  // ── factions.json ──
  const colors = new Map<string, number>();
  d.factions.forEach((f, i) => {
    const c = f.color.toUpperCase();
    if (colors.has(c)) err('factions.json', `[${i}].color`, `cor ${f.color} repetida (facção [${colors.get(c)}])`);
    colors.set(c, i);
  });

  // ── treaties.json ──
  const pactIds = new Set(d.treaties.pacts.map((p) => p.id));
  const triggers = new Map(d.treaties.contract.triggers.map((t) => [t.verb, t]));
  const consequences = new Map(d.treaties.contract.consequences.map((c) => [c.verb, c]));
  d.treaties.templates.forEach((t, i) => {
    if (t.type === 'pact') {
      if (!pactIds.has(t.pact)) err('treaties.json', `.templates[${i}].pact`, `pacto "${t.pact}" não existe`);
      return;
    }
    const trig = triggers.get(t.if.verb);
    if (!trig) err('treaties.json', `.templates[${i}].if.verb`, `gatilho "${t.if.verb}" não existe`);
    else if (!trig.objects.includes(t.if.object)) {
      err('treaties.json', `.templates[${i}].if.object`, `"${t.if.object}" não é objeto válido de "${t.if.verb}"`);
    }
    const cons = consequences.get(t.then.verb);
    if (!cons) err('treaties.json', `.templates[${i}].then.verb`, `consequência "${t.then.verb}" não existe`);
    else if (!cons.objects.includes(t.then.object)) {
      err(
        'treaties.json',
        `.templates[${i}].then.object`,
        `"${t.then.object}" não é objeto válido de "${t.then.verb}"`,
      );
    }
  });

  // ── balance.json ──
  d.balance.provisional.forEach((p, i) => {
    if (getPath(d.balance, p) === undefined) {
      err('balance.json', `.provisional[${i}]`, `caminho "${p}" não existe em balance.json`);
    }
  });
  const levels = [...drawLevels].sort((a, b) => a - b);
  levels.forEach((lvl, i) => {
    if (lvl !== i) err('balance.json', '.cards.universityDraw', `níveis devem ser 0..N contíguos (faltando ${i})`);
  });
  for (const [deck, [min, max]] of Object.entries(d.balance.tierBands)) {
    if (min > max) err('balance.json', `.tierBands.${deck}`, `faixa invertida [${min}, ${max}]`);
  }

  // ── layouts.json ──
  for (const [key, cells] of Object.entries(d.layouts.layouts)) {
    if (cells.length !== Number(key)) {
      err('layouts.json', `.layouts["${key}"]`, `layout de ${key} jogadores tem ${cells.length} tabuleiros`);
    }
    const keys = new Set(cells.map((c) => `${c.q},${c.r}`));
    if (keys.size !== cells.length) err('layouts.json', `.layouts["${key}"]`, 'célula macro repetida');
  }
}

type CostPoints = GameData['balance']['costPoints'];
type CardCostInput = GameData['cards'][number]['cost'];

/** GDD 7.3: pontos de custo = recursos + descarte (ações não contam — ver D9). */
export function cardCostPoints(cost: CardCostInput, points: CostPoints): number {
  const resourcePoints = (amounts: Partial<Record<(typeof RESOURCE_IDS)[number], number>>) =>
    Object.entries(amounts).reduce(
      (sum, [res, n]) => sum + (n ?? 0) * points[res as (typeof RESOURCE_IDS)[number]],
      0,
    );
  let total = resourcePoints(cost.resources ?? {});
  if (cost.resourcesAny) total += Math.min(...cost.resourcesAny.map(resourcePoints));
  total += (cost.discard ?? 0) * points.discardCard;
  return total;
}

function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}
