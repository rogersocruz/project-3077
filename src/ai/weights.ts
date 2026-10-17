/**
 * Pesos da heurística da IA. Não são regras do jogo (essas vêm de data/*.json): são o
 * "gosto" do agente, em pontos de valor de recurso (resources.json → value). Ajustáveis
 * sem tocar no motor; o simulador usa os mesmos pesos para todos os níveis.
 */
import type { AiLevel } from './types';

export interface AiWeights {
  /** Produções futuras consideradas no valor de uma estrutura de extração. */
  readonly horizon: number;
  /** Desconto da renda futura (renda é menos certa que estoque). */
  readonly income: number;
  /** Trilha de vitória: peso × (melhor progresso)^expoente. */
  readonly victoryMax: number;
  readonly victoryExp: number;
  /** Com foco: peso das trilhas fora do foco no termo de melhor progresso. */
  readonly victoryOffFocus: number;
  /** Com foco em recurso que vem de Mina (Ouro/Petróleo): multiplica Universidade e sítios de Mina. */
  readonly mineRouteBoost: number;
  /** Soma dos progressos (desempate do limite de rodadas). */
  readonly victorySum: number;
  /** Na última rodada a soma vale mais (vence o maior progresso somado). */
  readonly victorySumFinal: number;
  /** Bônus por ter uma condição cumprida (vale no fim da rodada). */
  readonly winBonus: number;
  /** Capacidades por nível (índice = nível; 0 = não tem). */
  readonly university: readonly number[];
  readonly workshop: readonly number[];
  readonly archive: readonly number[];
  readonly market: readonly number[];
  readonly villageLevel: readonly number[];
  /** Cada Posto (alcance novo). */
  readonly outpost: number;
  /** Hex revelado em alcance com terreno produtivo ainda sem extrator próprio (× renda/turno). */
  readonly site: number;
  /** Pesos decrescentes dos melhores sítios abertos (os demais não contam). */
  readonly siteSlots: readonly number[];
  /** Oficina para quem tem Universidade 1 (destrava a Universidade 2). */
  readonly workshopForUniversity: number;
  /** Subsolo sondado com recurso, sem Mina (× renda de uma produção da Mina). */
  readonly mineSite: number;
  /** O mesmo, antes de destravar a Mina (Universidade 2). */
  readonly mineSiteLocked: number;
  /** Explorar: valor de abrir um hex fora do alcance (dentro do alcance usa `site`). */
  readonly exploreFar: number;
  /** Carta na mão por nível (n1, n2, n3); acima do limite de mão não vale nada. */
  readonly cardTier: readonly [number, number, number];
  /** Permanente instalado por nível (n1, n2, n3), escalado pelo horizonte. */
  readonly permanentTier: readonly [number, number, number];
  /** Bônus por jogar carta de informação (o motor não muda estado mensurável). */
  readonly infoPlay: number;
  /** Entrega de Sabotagem: dano estimado × este peso precisa superar o valor da carta na mão. */
  readonly sabotage: number;
  /** Ganho mínimo para fazer uma ação (evita ruído e laços de ações grátis). */
  readonly margin: number;
  /** Ganho mínimo para aceitar/propor troca com outro jogador. */
  readonly tradeMargin: number;
  /** Máximo de decisões grátis (banca, cartas, propostas) por turno. */
  readonly freeActionsPerTurn: number;
  /** Fácil: temperatura do sorteio ponderado. */
  readonly easyTemperature: number;
  /** Difícil: quantos primeiros passos aprofundar. */
  readonly hardBranching: number;
  /** Candidatos de Construir simulados por decisão (os melhores pela estimativa rápida). */
  readonly buildCandidates: number;
  /** Candidatos de Banca + Construir simulados por decisão. */
  readonly buyBuildCandidates: number;
  /** Fase 6: desconto da renda de estrutura em área de desastre (Montanha, Vulcão, sísmicos). */
  readonly hazardRisk: number;
  /** Valor de uma carta de Tesouro na mão (o nível delas é nulo). */
  readonly treasureCard: number;
  /** Bônus passivo de Ruína (+1 compra e linha n3), escalado pelo horizonte. */
  readonly ruinBonus: number;
  /** Fase 7: valor por ponto de força das primeiras `troopCore` tropas e das demais. */
  readonly troopCore: number;
  readonly troopBase: number;
  readonly troopExtra: number;
  /** Por ponto de força inimiga a ≤2 da própria Vila sem defesa equivalente. */
  readonly threat: number;
  /** Por ponto de força inimiga eliminada num combate previsto; perda própria pesa `troopLoss`. */
  readonly kill: number;
  readonly troopLoss: number;
  /** Tropa própria na Vila inimiga sem defensor (tira vida no fim da rodada). */
  readonly villageHit: number;
  /** Quartel por nível. */
  readonly barracks: readonly number[];
  /** Bot `investor`: rodada até a qual Universidade 2 / Mina valem o bônus abaixo. */
  readonly investorUniRound: number;
  readonly investorMineRound: number;
  /** Bônus por nível de Universidade (até 2) e por ter Mina, enquanto vale a prioridade. */
  readonly investorUni: number;
  readonly investorMine: number;
  /**
   * Fase 8: tratados. `treatyPeace` = valor por ponto de força do parceiro que deixa de ameaçar
   * (Não Agressão); `treatyToll` = entradas esperadas no território do outro enquanto o tratado
   * dura (por tropa); `treatyOdds` = chance estimada de um contrato disparar; `treatyMargin` =
   * quanto o tratado precisa render além do Ouro.
   */
  readonly treatyPeace: number;
  readonly treatyToll: number;
  readonly treatyOdds: number;
  readonly treatyMargin: number;
}

export const DEFAULT_WEIGHTS: AiWeights = {
  horizon: 6,
  income: 0.8,
  victoryMax: 90,
  victoryExp: 3,
  victoryOffFocus: 0.35,
  mineRouteBoost: 2,
  victorySum: 6,
  victorySumFinal: 60,
  winBonus: 400,
  university: [0, 14, 34, 44],
  workshop: [0, 7, 10, 12],
  archive: [0, 3, 5, 7],
  market: [0, 5, 8],
  villageLevel: [0, 0, 9, 16],
  outpost: 6,
  site: 1.5,
  siteSlots: [1, 0.6, 0.35],
  workshopForUniversity: 8,
  mineSite: 1.2,
  mineSiteLocked: 0.4,
  exploreFar: 0.8,
  cardTier: [2, 4, 6],
  permanentTier: [7, 11, 15],
  infoPlay: 2.5,
  sabotage: 1,
  margin: 0.25,
  tradeMargin: 1,
  freeActionsPerTurn: 14,
  easyTemperature: 4,
  hardBranching: 5,
  buildCandidates: 10,
  buyBuildCandidates: 4,
  hazardRisk: 0.15,
  treasureCard: 5,
  ruinBonus: 14,
  troopCore: 3,
  troopBase: 2.5,
  troopExtra: 0.8,
  threat: 3,
  kill: 2,
  troopLoss: 3,
  villageHit: 30,
  barracks: [0, 12, 16, 20],
  investorUniRound: 4,
  investorMineRound: 5,
  investorUni: 30,
  investorMine: 70,
  treatyPeace: 2.5,
  treatyToll: 0.5,
  treatyOdds: 0.4,
  treatyMargin: 1,
};

export const AI_LEVELS: readonly AiLevel[] = ['easy', 'normal', 'hard'];
