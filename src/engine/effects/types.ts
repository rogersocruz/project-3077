/**
 * Contrato de um efeito de carta (CLAUDE.md, regra 6: toda carta é um `effectId`).
 * Cada handler declara as camadas que exige, o tipo de alvo e o esquema dos `params`
 * (validado na carga dos dados: parâmetro errado falha antes da partida).
 */
import type { z } from 'zod';
import type { CardDef, EngineContext } from '../context';
import type { GameEvent } from '../events';
import type { Reason } from '../reasons';
import type { CardTarget, CardUid, GameState, LayerName, PlayerId } from '../state';

export type { CardDef };
export type TargetKind = CardTarget['kind'] | 'none';
export type TargetOf<K extends TargetKind> = K extends 'none' ? undefined : Extract<CardTarget, { kind: K }>;
/** Alvos enumeráveis do tipo K (nenhum para 'none'). */
export type TargetItem<K extends TargetKind> = Extract<CardTarget, { kind: K }>;

/** Quem joga e, na entrega, quem recebe. */
export interface EffectScope {
  readonly ctx: EngineContext;
  readonly state: GameState;
  /** Quem joga a carta (na entrega, o remetente). */
  readonly player: PlayerId;
  /** Carta entregue: o destinatário (null para carta própria/permanente). */
  readonly recipient: PlayerId | null;
  readonly card: CardUid;
  readonly def: CardDef;
  /** `play` = ao jogar/entregar; `resolve` = na Revelação do destinatário. */
  readonly stage: 'play' | 'resolve';
  /** Espionagem: permanente do remetente escolhido para sair se faltar slot (AF). */
  readonly sacrifice?: CardUid;
}

/** Escopo de aplicação: o estado é a cópia de trabalho do reducer. */
export interface ApplyScope extends EffectScope {
  readonly events: GameEvent[];
}

/** Quem sofre/recebe o efeito: o destinatário na entrega, senão quem joga. */
export const subjectOf = (s: EffectScope): PlayerId => s.recipient ?? s.player;

/** Carta que só vale junto com outra ação (GDD 6.5: Drone com Sondar/Construir). */
export type ModifierKind = 'drone' | 'halfCost';

export interface EffectSpec<P, K extends TargetKind> {
  readonly params: z.ZodType<P>;
  readonly target: K;
  /** Camadas exigidas; com alguma desligada a carta fica fora do baralho (interpretação U). */
  readonly requires?: readonly LayerName[];
  /** false = handler "camada desligada": a regra entra numa fase futura. */
  readonly implemented?: boolean;
  readonly modifier?: ModifierKind;
  /** Alvos a considerar (a validade final é de `check`). */
  candidates?(s: EffectScope, params: P): TargetItem<K>[];
  check?(s: EffectScope, params: P, target: TargetOf<K>): Reason | null;
  apply?(s: ApplyScope, params: P, target: TargetOf<K>): void;
  /** Permanente: efeito no momento da instalação (o resto é passivo, lido pelas regras). */
  onInstall?(s: ApplyScope, params: P): void;
}

export interface EffectHandler {
  readonly requires: readonly LayerName[];
  readonly implemented: boolean;
  readonly target: TargetKind;
  readonly modifier: ModifierKind | null;
  /** Mensagem de erro dos parâmetros, ou null se válidos. */
  validateParams(raw: unknown): string | null;
  candidates(s: EffectScope): CardTarget[];
  check(s: EffectScope, target: CardTarget | undefined): Reason | null;
  apply(s: ApplyScope, target: CardTarget | undefined): void;
  onInstall(s: ApplyScope): void;
}

export class LayerDisabledError extends Error {
  constructor(effectId: string) {
    super(`efeito "${effectId}" pertence a uma camada desligada (fase futura)`);
    this.name = 'LayerDisabledError';
  }
}

/** O alvo bate com o tipo pedido pelo efeito. */
function matches<K extends TargetKind>(kind: K, target: CardTarget | undefined): target is TargetOf<K> {
  return kind === 'none' ? target === undefined : target?.kind === kind;
}

/**
 * Embrulha um efeito tipado num handler uniforme. Os parâmetros são lidos de
 * `def.params` e analisados uma vez por carta (cache por objeto de dados).
 */
export function defineEffect<P, K extends TargetKind>(spec: EffectSpec<P, K>): EffectHandler {
  const cache = new WeakMap<object, P>();
  const params = (def: CardDef): P => {
    let p = cache.get(def.params);
    if (p === undefined) {
      p = spec.params.parse(def.params);
      cache.set(def.params, p);
    }
    return p;
  };
  const disabled = (): Reason => ({ key: 'layerDisabled', params: { layer: spec.requires?.[0] ?? '' } });
  return {
    requires: spec.requires ?? [],
    implemented: spec.implemented ?? true,
    target: spec.target,
    modifier: spec.modifier ?? null,
    validateParams: (raw) => {
      const r = spec.params.safeParse(raw);
      return r.success ? null : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    },
    candidates: (s) => spec.candidates?.(s, params(s.def)) ?? [],
    check: (s, target) => {
      if (spec.implemented === false) return disabled();
      if (!matches(spec.target, target)) {
        return spec.target !== 'none' && target === undefined
          ? { key: 'targetRequired' }
          : { key: 'invalidTarget' };
      }
      return spec.check?.(s, params(s.def), target) ?? null;
    },
    apply: (s, target) => {
      if (spec.implemented === false) throw new LayerDisabledError(s.def.effectId);
      if (!matches(spec.target, target)) throw new TypeError(`${s.def.id}: alvo de tipo errado`);
      spec.apply?.(s, params(s.def), target);
    },
    onInstall: (s) => {
      if (spec.implemented === false) throw new LayerDisabledError(s.def.effectId);
      spec.onInstall?.(s, params(s.def));
    },
  };
}
