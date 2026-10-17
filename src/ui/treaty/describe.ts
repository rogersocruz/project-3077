/**
 * Tratado em linguagem natural (UX_SPEC 2.12, passo 3): "SE Piratas ENTRAR EM território de
 * Revolucionários, ENTÃO o invasor PAGA 1 Ferro por tropa em vez da tarifa." Os papéis
 * me/you viram os nomes de quem propôs e de quem recebe.
 */
import type { TFunction } from 'i18next';
import { loadGameData } from '../../data';
import type { PlayerId, TreatyTerms } from '../../engine';
import type { TreatyDraft } from '../../engine/rules/treaties';

export interface TreatyNames {
  readonly from: PlayerId;
  readonly to: PlayerId;
  readonly name: (id: PlayerId) => string;
  /** Nome do permanente (ENTREGA permanente). */
  readonly card?: (uid: number) => string;
}

export function pactDef(id: string) {
  return loadGameData().treaties.pacts.find((p) => p.id === id);
}

export function templateName(id: string | undefined): string | null {
  if (!id) return null;
  return loadGameData().treaties.templates.find((x) => x.id === id)?.name ?? null;
}

/** Nome de um papel no texto. */
export function roleText(t: TFunction, role: string, n: TreatyNames): string {
  if (role === 'me') return n.name(n.from);
  if (role === 'you') return n.name(n.to);
  return t(`treaty.role.${role}`, { a: n.name(n.from), b: n.name(n.to) });
}

/** "de quem" com a preposição ("de Piratas", "do outro signatário"). */
export function ofText(t: TFunction, role: string, n: TreatyNames): string {
  if (role === 'me' || role === 'you') return t('treaty.roleOf.name', { name: roleText(t, role, n) });
  return t(`treaty.roleOf.${role}`, { a: n.name(n.from), b: n.name(n.to) });
}

/** Consequência ("PAGA 3 Ferro", "NÃO PODE ATACAR por 2 rodadas"…). */
export function consequenceText(
  t: TFunction,
  d: Extract<TreatyDraft, { kind: 'contract' }>,
  n: TreatyNames,
): string {
  if (!d.consequence) return '…';
  const res = d.resource ? t(`resources.${d.resource}`) : '';
  const perTroop = d.perTroop ? t('treaty.perTroop') : '';
  switch (d.consequence) {
    case 'pay':
      return d.target === 'card'
        ? t('treaty.cons.payCards', { count: d.amount ?? 1 })
        : t('treaty.cons.pay', { amount: d.amount ?? 1, resource: res, perTroop });
    case 'give':
      return d.target === 'permanent'
        ? t('treaty.cons.givePermanent', {
            card: d.permanent !== undefined && n.card ? n.card(d.permanent) : t('treaty.object.permanent'),
          })
        : t('treaty.cons.giveCard');
    case 'discard':
      return t('treaty.cons.discard', { count: d.amount ?? 1 });
    case 'loseAction':
      return t('treaty.cons.loseAction', { count: d.amount ?? 1 });
    case 'forbid':
      return t('treaty.cons.forbid', {
        verb: d.target ? t(`treaty.verb.${d.target}`) : '…',
        count: d.rounds ?? 1,
      });
    case 'overrideToll':
      return t('treaty.cons.overrideToll', { amount: d.amount ?? 1, resource: res, perTroop });
    default:
      return d.consequence;
  }
}

/** Frase completa (rascunho incompleto mostra "…" no que falta). */
export function treatyText(t: TFunction, terms: TreatyTerms | TreatyDraft, n: TreatyNames): string {
  if (terms.kind === 'pact') {
    const def = terms.pact ? pactDef(terms.pact) : undefined;
    if (!def) return t('treaty.pactPending');
    const extra =
      terms.resource && terms.price
        ? t('treaty.fixedPrice', { resource: t(`resources.${terms.resource}`), price: terms.price })
        : '';
    return t('treaty.pactSentence', { name: def.name, text: def.text, extra });
  }
  const dots = '…';
  return t('treaty.sentence', {
    if: t(terms.negated ? 'treaty.ifNot' : 'treaty.if'),
    subject: terms.subject ? roleText(t, terms.subject, n) : dots,
    verb: terms.verb ? t(`treaty.verb.${terms.verb}`) : dots,
    object: terms.object ? t(`treaty.object.${terms.object}`) : dots,
    of: terms.of ? ofText(t, terms.of, n) : dots,
    obligor: terms.obligor ? roleText(t, terms.obligor, n) : dots,
    consequence: consequenceText(t, terms, n),
    beneficiary:
      terms.obligor === 'me'
        ? n.name(n.to)
        : terms.obligor === 'you'
          ? n.name(n.from)
          : t('treaty.role.partner'),
  });
}
