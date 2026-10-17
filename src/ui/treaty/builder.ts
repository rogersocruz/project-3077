/**
 * Lógica do construtor de tratado (UX_SPEC 2.12): árvore em passos, sem campo livre. Cada
 * passo só oferece o que o motor aceita (checkTreatyTerms com rascunho parcial), então o
 * construtor nunca monta combinação inválida (GDD 10).
 */
import { RESOURCE_IDS, type ResourceId } from '../../data/schemas';
import type { EngineContext, GameState, PlayerId, TreatyTerms } from '../../engine';
import { checkTreatyTerms, type TreatyDraft } from '../../engine/rules/treaties';

export type ContractDraft = Extract<TreatyDraft, { kind: 'contract' }>;
export type PactDraft = Extract<TreatyDraft, { kind: 'pact' }>;

/** Passos do contrato, na ordem; escolher um apaga os seguintes. */
export const CONTRACT_STEPS = [
  'subject',
  'verb',
  'object',
  'of',
  'obligor',
  'consequence',
  'target',
] as const;
export type ContractStep = (typeof CONTRACT_STEPS)[number];
const PARAMS = ['resource', 'amount', 'perTroop', 'rounds', 'permanent'] as const;

export interface BuilderScope {
  readonly ctx: EngineContext;
  readonly state: GameState;
  readonly from: PlayerId;
  readonly to: PlayerId;
}

const ok = (b: BuilderScope, d: TreatyDraft, complete = false) =>
  checkTreatyTerms(b.ctx, b.state, b.from, b.to, d, complete) === null;

/** Valores possíveis do passo (todos os do vocabulário de treaties.json). */
function vocabulary(b: BuilderScope, d: ContractDraft, step: ContractStep): string[] {
  const k = b.ctx.data.treaties.contract;
  switch (step) {
    case 'subject':
      return k.subjects;
    case 'verb':
      return k.triggers.map((t) => t.verb);
    case 'object':
      return k.triggers.find((t) => t.verb === d.verb)?.objects ?? [];
    case 'of':
      return k.victims;
    case 'obligor':
      return k.obligors;
    case 'consequence':
      return k.consequences.map((c) => c.verb);
    case 'target':
      return k.consequences.find((c) => c.verb === d.consequence)?.objects ?? [];
  }
}

/** Rascunho com o passo escolhido e os passos seguintes apagados. */
export function withStep(d: ContractDraft, step: ContractStep, value: string): ContractDraft {
  const out: Record<string, unknown> = { kind: 'contract', negated: d.negated ?? false };
  for (const s of CONTRACT_STEPS) {
    if (s === step) {
      out[s] = value;
      break;
    }
    if (d[s] !== undefined) out[s] = d[s];
  }
  return out as ContractDraft;
}

/** Opções válidas do passo, dado o que já foi escolhido. */
export function stepOptions(b: BuilderScope, d: ContractDraft, step: ContractStep): string[] {
  return vocabulary(b, d, step).filter((v) => ok(b, withStep(d, step, v)));
}

/** SE / SE NÃO: trocar apaga tudo depois do sujeito. */
export function withNegation(d: ContractDraft, negated: boolean): ContractDraft {
  return { kind: 'contract', negated, ...(d.subject ? { subject: d.subject } : {}) };
}

export function negationAllowed(b: BuilderScope, d: ContractDraft): boolean {
  return ok(b, withNegation(d, true));
}

/**
 * Detalhes padrão quando o alvo da consequência foi escolhido: a primeira combinação de
 * recurso/quantidade/rodadas/permanente que o motor aceita.
 */
export function withDefaults(b: BuilderScope, d: ContractDraft): ContractDraft {
  if (!d.target) return d;
  const base: Record<string, unknown> = { ...d };
  for (const p of PARAMS) delete base[p];
  const owner = d.obligor === 'me' ? b.from : d.obligor === 'you' ? b.to : null;
  const perms =
    owner === null ? [] : (b.state.players[owner]?.permanents.filter((c): c is number => c !== null) ?? []);
  const resources: (ResourceId | undefined)[] = [undefined, ...RESOURCE_IDS];
  for (const resource of resources)
    for (const amount of [undefined, 1])
      for (const rounds of [undefined, 1])
        for (const permanent of [undefined, ...perms]) {
          const c = {
            ...base,
            ...(resource ? { resource } : {}),
            ...(amount ? { amount } : {}),
            ...(rounds ? { rounds } : {}),
            ...(permanent !== undefined ? { permanent } : {}),
          } as ContractDraft;
          if (ok(b, c, true)) return c;
        }
  return d;
}

/** Recursos que o motor aceita no detalhe (mantendo o resto). */
export function resourceOptions(b: BuilderScope, d: ContractDraft): ResourceId[] {
  return RESOURCE_IDS.filter((r) => ok(b, { ...d, resource: r }, true));
}

/** O detalhe pode ser "por tropa"? */
export function perTroopAllowed(b: BuilderScope, d: ContractDraft): boolean {
  return ok(b, { ...d, perTroop: true }, true);
}

/** Pactos da categoria que o motor aceita entre os dois (camadas, contradições). */
export function pactOptions(b: BuilderScope, category: string): string[] {
  return b.ctx.data.treaties.pacts
    .filter((p) => p.category === category)
    .map((p) => p.id)
    .filter((id) => ok(b, withPactDefaults(b, { kind: 'pact', pact: id }), true));
}

/** Preço Fixo começa com o primeiro recurso aceito e preço 1. */
export function withPactDefaults(b: BuilderScope, d: PactDraft): PactDraft {
  const def = b.ctx.data.treaties.pacts.find((p) => p.id === d.pact);
  if (!def?.params?.length) return { kind: 'pact', ...(d.pact ? { pact: d.pact } : {}) };
  const resource = d.resource ?? RESOURCE_IDS.find((r) => r !== 'gold');
  return { ...d, ...(resource ? { resource } : {}), price: d.price ?? 1 };
}

export function isComplete(b: BuilderScope, d: TreatyDraft): d is TreatyTerms {
  return ok(b, d, true);
}
