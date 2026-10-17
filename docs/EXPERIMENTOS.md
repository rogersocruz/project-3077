# PROJETO 3077 — Experimentos de balanceamento

> Gerado por `npm run sim:experiments` (scripts/experiments.ts). Todas as taxas com intervalo
> de confiança de 95% (Wilson para proporções; média ± 1,96·dp/√n para médias). Seeds 1–200
> em todos os lotes. `data/balance.json` não foi alterado: variações por override
> (simulations/experiments/*/config.json).
> Tempo total: 16.5 min.

<!-- LEITURA -->
## Leitura (resumo para decisão)

**Limites da evidência.** Tudo aqui mede *esta* IA (gulosa de 1 passo, com rota sorteada),
não jogadores humanos. A base reproduz o relatório anterior dentro do IC (Carvão 63,5%
[56,6–69,9] contra 65% antes). Antes dos experimentos, a IA ganhou o plano "banca + melhorar"
(o mesmo "banca + construir" aplicado a melhorias) — sem isso nenhum bot chegava à
Universidade 2; a base foi rodada já com essa mudança.

### 1. Trajetórias
- **Só o Carvão acumula de forma constante:** +1 a 2 por rodada desde a 3ª; mediana 14 na
  rodada 9 (limiar 18). É por isso que o Carvão vence ~64% das partidas.
- **Pedregulho e Ferro ficam parados até a rodada 7–8:** quem persegue gasta o próprio
  recurso construindo (líquido 0); a acumulação só começa quando a construção para.
- **Comida não acumula nada** (mediana 4 = estoque inicial até a rodada 8): o bot que persegue
  Comida não constrói Parques em Floresta/Lagoa. Limitação da IA — a heurística valoriza
  Comida pelo valor 1 da tabela e prefere outros Parques. Conclusão sobre Comida = inconclusiva.
- **Ouro e Petróleo:** Ouro parado em ~1 (só sobe com Veio de Ouro ou Mina, raros); Petróleo 0
  (não existe Petróleo de superfície e a Mina quase não aparece).
- **Banca:** mediana 0 comprado em todas as rotas — o spread torna a compra do recurso-alvo
  pouco atraente para a IA.
- **Expansão:** +1 hex por rodada; 11 na rodada 9 e 15 só na 12 — tarde demais na corrida.

### 2. Investidor
- Taxa de vitória **12,5% [8,6–17,8]**, abaixo da parte justa (25%) e dos Normais da mesma
  mesa (29,2% [25,7–32,9]): os intervalos não se tocam — **investir cedo na Mina perde**.
- Universidade 2 até a rodada 4: **0,0% [0,0–1,9]**; Mina até a rodada 5: **0,0% [0,0–1,9]**.
  Mesmo priorizando, o caminho (Univ. 1 + Oficina + Univ. 2 = 7 Ferro, 3 Pedregulho, 2 Ouro e
  3 ações) não cabe nas 4–5 primeiras rodadas com a renda de 2–3 recursos por turno.
- Quando ganha, ganha por Ouro (14 de 25 vitórias): a Mina chega tarde (22,5% [17,3–28,8] dos
  investors constroem alguma), mas, quando chega, decide.

### 3. A/B da Mina (rarity 1)
- **Quebra o jogo:** Ouro 73,5% [67,0–79,1] e Petróleo 24,5% [19,1–30,9] das vitórias; Carvão
  cai de 63,5% para 2,0% [0,8–5,0]; duração cai de 8,88 para 5,65 rodadas.
- 85% dos jogadores constroem Mina (contra 9,6%); 2,1 Minas por jogador; Petróleo produzido
  ×20; Carvão de manutenção ×18.
- Conclusão: hoje é a **exigência de Universidade 2** que segura a Mina. O multiplicador ×3
  (D4) é alto demais para uma Mina acessível. Se a meta é a rota da Mina possível mas não
  dominante, testar Mina r1 com multiplicador ×2 e/ou 3 tokens, ou um custo intermediário.

### 4. Calibração — o método, como pedido, não serve
As 3 tabelas estão abaixo. A iteração **converge** em T=10 (fixa na 2ª), quase em T=12
(só Carvão −10%) e **não converge** em T=15 (Comida +38%, Pedregulho −15% entre a 2ª e a 3ª).
Mas os limiares para onde ela converge são **degenerados**: na validação, as partidas acabam
em 1,0 / 1,4 / 2,2 rodadas. Motivos:
1. **Mediana ≠ corrida.** O limiar na mediana significa que metade dos bots da rota o alcança
   até T; numa partida real vence o *mais rápido* de 4 jogadores, muito antes de T.
2. **Rotas que a IA não acumula** (Comida, Petróleo, Ouro) dão mediana ≈ estoque inicial ou 0
   → limiar 1–4 → vitória na 1ª rodada (Comida 4 = estoque inicial; Petróleo 1 = uma compra).
3. **Retroalimentação:** o limiar muda a avaliação da IA, que muda a trajetória.
Alternativas para calibrar (não aplicadas — escolha sua):
- limiar = **estoque inicial + ganho** e usar o **percentil 90** (o líder) em vez da mediana;
- ou calibrar pelo **tempo de primeira chegada**: limiar tal que o primeiro bot da rota chegue
  na rodada T (mediana entre partidas);
- e, antes de calibrar Comida/Ouro/Petróleo, corrigir a IA para que essas rotas acumulem.

**Nada foi aplicado ao balance.json.** Overrides de cada lote em simulations/experiments/.
<!-- /LEITURA -->
## Base (referência)

Seeds 1–200, 4 jogadores, Economia + Cartas, IA Normal com rotas sorteadas. Código atual
(depois da Fase 6: a IA ganhou risco de hazard e Escavar, que só valem com eventos/hexes
especiais — desligados aqui).

| Condição | Base |
|---|---|
| Comida | 0.0% [0.0–1.9] |
| Pedregulho | 4.5% [2.4–8.3] |
| Ferro | 8.0% [5.0–12.6] |
| Carvão | 63.5% [56.6–69.9] |
| Petróleo | 1.0% [0.3–3.6] |
| Ouro | 18.0% [13.3–23.9] |
| Expansão | 6.0% [3.5–10.2] |
| Limite de rodadas | 0.0% [0.0–1.9] |
| Duração média (rodadas) | 8.88 [8.71–9.06] |

Vitórias por assento: 0: 25.0% [19.5–31.4] · 1: 26.5% [20.9–33.0] · 2: 21.0% [15.9–27.2] · 3: 27.5% [21.8–34.1]

## 1. Trajetórias por rota perseguida

Mediana por rodada entre os assentos que perseguiam a rota e ainda estavam em jogo (n).
"Líquido" = produzido − gasto do recurso na rodada (construir, melhorar, cartas, manutenção);
"Comprado" = recebido da banca. As partidas acabam por volta da rodada 9: depois disso n cai
e a mediana passa a ser das partidas mais longas (viés de sobrevivência).

#### Comida (alvo: Comida)

| Rodada | n | Estoque | Líquido (prod − gasto) | Comprado na banca |
|---|---|---|---|---|
| 1 | 120 | 4 | 0 | 0 |
| 2 | 120 | 4 | 0 | 0 |
| 3 | 120 | 4 | 0 | 0 |
| 4 | 120 | 4 | 0 | 0 |
| 5 | 120 | 4 | 0 | 0 |
| 6 | 120 | 4 | 0 | 0 |
| 7 | 116 | 4 | 0 | 0 |
| 8 | 105 | 4 | 0 | 0 |
| 9 | 73 | 5 | 0 | 0 |
| 10 | 37 | 8 | 1 | 0 |
| 11 | 14 | 9.5 | 1 | 0 |
| 12 | 2 | 11.5 | 1 | 0 |
| 13 | 0 | — | — | — |
| 14 | 0 | — | — | — |
| 15 | 0 | — | — | — |

#### Pedregulho (alvo: Pedregulho)

| Rodada | n | Estoque | Líquido (prod − gasto) | Comprado na banca |
|---|---|---|---|---|
| 1 | 102 | 0 | -4 | 0 |
| 2 | 102 | 0 | 0 | 0 |
| 3 | 102 | 0 | 0 | 0 |
| 4 | 102 | 0 | 0 | 0 |
| 5 | 102 | 0 | 0 | 0 |
| 6 | 102 | 1 | 0 | 0 |
| 7 | 100 | 1 | 0 | 0 |
| 8 | 86 | 2 | 1 | 0 |
| 9 | 64 | 3.5 | 1.5 | 0 |
| 10 | 29 | 9 | 2 | 0 |
| 11 | 6 | 13 | 3.5 | 0 |
| 12 | 0 | — | — | — |
| 13 | 0 | — | — | — |
| 14 | 0 | — | — | — |
| 15 | 0 | — | — | — |

#### Ferro (alvo: Ferro)

| Rodada | n | Estoque | Líquido (prod − gasto) | Comprado na banca |
|---|---|---|---|---|
| 1 | 112 | 1 | -2 | 0 |
| 2 | 112 | 1 | 0 | 0 |
| 3 | 112 | 1 | 0 | 0 |
| 4 | 112 | 1 | 0 | 0 |
| 5 | 112 | 1 | 0 | 0 |
| 6 | 112 | 2 | 0 | 0 |
| 7 | 108 | 2 | 1 | 0 |
| 8 | 94 | 3 | 1 | 0 |
| 9 | 65 | 3 | 1 | 0 |
| 10 | 26 | 7.5 | 2 | 0 |
| 11 | 8 | 8.5 | 2 | 0 |
| 12 | 0 | — | — | — |
| 13 | 0 | — | — | — |
| 14 | 0 | — | — | — |
| 15 | 0 | — | — | — |

#### Carvão (alvo: Carvão)

| Rodada | n | Estoque | Líquido (prod − gasto) | Comprado na banca |
|---|---|---|---|---|
| 1 | 123 | 1 | 0 | 0 |
| 2 | 123 | 2 | 0 | 0 |
| 3 | 123 | 2 | 1 | 0 |
| 4 | 123 | 3 | 1 | 0 |
| 5 | 123 | 4 | 1 | 0 |
| 6 | 123 | 6 | 1 | 0 |
| 7 | 116 | 7 | 1 | 0 |
| 8 | 107 | 10 | 1 | 0 |
| 9 | 72 | 14 | 2 | 0 |
| 10 | 30 | 16 | 2 | 0 |
| 11 | 6 | 14 | 2 | 0 |
| 12 | 1 | 15 | 3 | 4 |
| 13 | 0 | — | — | — |
| 14 | 0 | — | — | — |
| 15 | 0 | — | — | — |

#### Petróleo (alvo: Petróleo)

| Rodada | n | Estoque | Líquido (prod − gasto) | Comprado na banca |
|---|---|---|---|---|
| 1 | 114 | 0 | 0 | 0 |
| 2 | 114 | 0 | 0 | 0 |
| 3 | 114 | 0 | 0 | 0 |
| 4 | 114 | 0 | 0 | 0 |
| 5 | 114 | 0 | 0 | 0 |
| 6 | 114 | 0 | 0 | 0 |
| 7 | 110 | 0 | 0 | 0 |
| 8 | 100 | 0 | 0 | 0 |
| 9 | 73 | 0 | 0 | 0 |
| 10 | 44 | 0 | 0 | 0 |
| 11 | 21 | 0 | 0 | 0 |
| 12 | 5 | 0 | 0 | 0 |
| 13 | 0 | — | — | — |
| 14 | 0 | — | — | — |
| 15 | 0 | — | — | — |

#### Ouro (alvo: Ouro)

| Rodada | n | Estoque | Líquido (prod − gasto) | Comprado na banca |
|---|---|---|---|---|
| 1 | 112 | 0 | -1 | 0 |
| 2 | 112 | 0.5 | 0 | 0 |
| 3 | 112 | 1 | 0 | 0 |
| 4 | 112 | 0.5 | 0 | 0 |
| 5 | 112 | 1 | 0 | 0 |
| 6 | 112 | 1 | 0 | 0 |
| 7 | 112 | 1 | 0 | 0 |
| 8 | 105 | 1 | 0 | 0 |
| 9 | 81 | 1 | 0 | 0 |
| 10 | 46 | 1 | 0 | 0 |
| 11 | 12 | 8 | 1 | 0 |
| 12 | 1 | 6 | 6 | 0 |
| 13 | 0 | — | — | — |
| 14 | 0 | — | — | — |
| 15 | 0 | — | — | — |

#### Expansão (alvo: hexes com estrutura)

| Rodada | n | Estoque | Líquido (prod − gasto) | Comprado na banca |
|---|---|---|---|---|
| 1 | 117 | 4 | 4 | 0 |
| 2 | 117 | 4 | 1 | 0 |
| 3 | 117 | 5 | 1 | 0 |
| 4 | 117 | 6 | 1 | 0 |
| 5 | 117 | 7 | 1 | 0 |
| 6 | 117 | 8 | 1 | 0 |
| 7 | 110 | 9 | 1 | 0 |
| 8 | 103 | 10 | 1 | 0 |
| 9 | 72 | 11 | 1 | 0 |
| 10 | 32 | 12.5 | 1 | 0 |
| 11 | 13 | 13 | 1 | 0 |
| 12 | 3 | 15 | 2 | 0 |
| 13 | 0 | — | — | — |
| 14 | 0 | — | — | — |
| 15 | 0 | — | — | — |

## 2. Experimento Investidor

Bot `investor` = Normal + bônus de avaliação por Universidade (até nível 2) até a rodada 4 e
por ter Mina até a rodada 5 (pesos em src/ai/weights.ts); valoriza sítios de Mina nesse
período. 1 investor + 3 normais, o investor gira de assento (50 partidas em cada).

| Métrica | Investor | Normais (por assento) |
|---|---|---|
| Taxa de vitória | **12.5% [8.6–17.8]** | 29.2% [25.7–32.9] |
| Universidade 2 até a rodada 4 | 0.0% [0.0–1.9] | 0.2% [0.0–0.9] |
| Mina até a rodada 5 | 0.0% [0.0–1.9] | 0.0% [0.0–0.6] |
| Alguma Mina na partida | 22.5% [17.3–28.8] | 10.0% [7.8–12.7] |
| Minas construídas (média) | 0.56 [0.40–0.73] | 0.26 [0.19–0.33] |

Parte justa com 4 jogadores = 25%. Por assento do investor: 0: 12.0% [5.6–23.8] · 1: 12.0% [5.6–23.8] · 2: 10.0% [4.3–21.4] · 3: 16.0% [8.3–28.5].

Vitórias do investor por condição: Pedregulho 3 · Ferro 1 · Carvão 6 · Petróleo 1 · Ouro 14.

## 3. A/B da Mina (override `structures.json → mine.rarity = 1`)

Mina sem exigir Universidade 2. Mesmas seeds da base (pareado).

| Condição | Base (rarity 2) | Mina rarity 1 |
|---|---|---|
| Comida | 0.0% [0.0–1.9] | 0.0% [0.0–1.9] |
| Pedregulho | 4.5% [2.4–8.3] | 0.0% [0.0–1.9] |
| Ferro | 8.0% [5.0–12.6] | 0.0% [0.0–1.9] |
| Carvão | 63.5% [56.6–69.9] | 2.0% [0.8–5.0] |
| Petróleo | 1.0% [0.3–3.6] | 24.5% [19.1–30.9] |
| Ouro | 18.0% [13.3–23.9] | 73.5% [67.0–79.1] |
| Expansão | 6.0% [3.5–10.2] | 0.0% [0.0–1.9] |
| Limite de rodadas | 0.0% [0.0–1.9] | 0.0% [0.0–1.9] |
| Duração média (rodadas) | 8.88 [8.71–9.06] | 5.65 [5.49–5.81] |

| Métrica (IC 95%) | Base | Mina rarity 1 |
|---|---|---|
| Minas construídas por jogador | 0.24 [0.18–0.30] | 2.10 [1.99–2.20] |
| Jogadores com alguma Mina | 9.6% [7.8–11.9] | 85.0% [82.4–87.3] |
| Petróleo produzido por partida | 0.66 [0.34–0.98] | 13.20 [11.94–14.46] |
| Ouro produzido por partida | 12.49 [11.17–13.82] | 23.23 [21.83–24.64] |
| Carvão consumido por partida (manutenção) | 0.59 [0.40–0.79] | 10.80 [10.05–11.56] |
| Carvão consumido por partida (manutenção + gasto) | 7.88 [7.54–8.22] | 15.64 [14.77–16.52] |
| Duração (rodadas) | 8.88 [8.71–9.06] | 5.65 [5.49–5.81] |

## 4. Calibração de limiares

Para cada T: simula até a rodada T sem vitória antecipada (variante de laboratório
`playToRoundLimit`, `turn.roundLimit = T` por override), mede a mediana do estoque na rodada T
dos bots que perseguem cada recurso e propõe esse valor (inteiro, mínimo 1) como limiar.
Itera 3 vezes: limiar usado → mediana medida → limiar proposto. Expansão não é recalibrada.
**Nada aplicado ao balance.json.**

### T = 10

| Recurso | Base | It. 1: mediana (n) → proposta | It. 2: mediana (n) → proposta | It. 3: mediana (n) → proposta |
|---|---|---|---|---|
| Comida | 40 | 4 (120) → **4** | 4 (120) → **4** | 4 (120) → **4** |
| Pedregulho | 30 | 7.5 (102) → **8** | 8 (102) → **8** | 8 (102) → **8** |
| Ferro | 25 | 6 (112) → **6** | 6 (112) → **6** | 6 (112) → **6** |
| Carvão | 18 | 16 (123) → **16** | 14 (123) → **14** | 14 (123) → **14** |
| Petróleo | 10 | 0 (114) → **1** | 1 (114) → **1** | 1 (114) → **1** |
| Ouro | 10 | 3 (112) → **3** | 3 (112) → **3** | 3 (112) → **3** |

Variação entre a 2ª e a 3ª proposta: Comida +0 (0%) · Pedregulho +0 (0%) · Ferro +0 (0%) · Carvão +0 (0%) · Petróleo +0 (0%) · Ouro +0 (0%).

Validação (limiares da 3ª proposta, partida normal até 15 rodadas):

| Condição | Base | Proposta T=10 |
|---|---|---|
| Comida | 0.0% [0.0–1.9] | 97.0% [93.6–98.6] |
| Pedregulho | 4.5% [2.4–8.3] | 12.0% [8.2–17.2] |
| Ferro | 8.0% [5.0–12.6] | 12.5% [8.6–17.8] |
| Carvão | 63.5% [56.6–69.9] | 0.0% [0.0–1.9] |
| Petróleo | 1.0% [0.3–3.6] | 2.0% [0.8–5.0] |
| Ouro | 18.0% [13.3–23.9] | 0.5% [0.1–2.8] |
| Expansão | 6.0% [3.5–10.2] | 0.0% [0.0–1.9] |
| Limite de rodadas | 0.0% [0.0–1.9] | 0.0% [0.0–1.9] |
| Duração média (rodadas) | 8.88 [8.71–9.06] | 1.00 [1.00–1.00] |

### T = 12

| Recurso | Base | It. 1: mediana (n) → proposta | It. 2: mediana (n) → proposta | It. 3: mediana (n) → proposta |
|---|---|---|---|---|
| Comida | 40 | 7 (120) → **7** | 10 (120) → **10** | 10 (120) → **10** |
| Pedregulho | 30 | 14 (102) → **14** | 15 (102) → **15** | 15 (102) → **15** |
| Ferro | 25 | 9 (112) → **9** | 9 (112) → **9** | 9 (112) → **9** |
| Carvão | 18 | 22 (123) → **22** | 21 (123) → **21** | 19 (123) → **19** |
| Petróleo | 10 | 0 (114) → **1** | 1 (114) → **1** | 1 (114) → **1** |
| Ouro | 10 | 10 (112) → **10** | 3 (112) → **3** | 3 (112) → **3** |

Variação entre a 2ª e a 3ª proposta: Comida +0 (0%) · Pedregulho +0 (0%) · Ferro +0 (0%) · Carvão -2 (-10%) · Petróleo +0 (0%) · Ouro +0 (0%).

Validação (limiares da 3ª proposta, partida normal até 15 rodadas):

| Condição | Base | Proposta T=12 |
|---|---|---|
| Comida | 0.0% [0.0–1.9] | 32.0% [25.9–38.8] |
| Pedregulho | 4.5% [2.4–8.3] | 0.0% [0.0–1.9] |
| Ferro | 8.0% [5.0–12.6] | 0.0% [0.0–1.9] |
| Carvão | 63.5% [56.6–69.9] | 0.0% [0.0–1.9] |
| Petróleo | 1.0% [0.3–3.6] | 66.0% [59.2–72.2] |
| Ouro | 18.0% [13.3–23.9] | 2.0% [0.8–5.0] |
| Expansão | 6.0% [3.5–10.2] | 0.0% [0.0–1.9] |
| Limite de rodadas | 0.0% [0.0–1.9] | 0.0% [0.0–1.9] |
| Duração média (rodadas) | 8.88 [8.71–9.06] | 1.42 [1.33–1.50] |

### T = 15

| Recurso | Base | It. 1: mediana (n) → proposta | It. 2: mediana (n) → proposta | It. 3: mediana (n) → proposta |
|---|---|---|---|---|
| Comida | 40 | 11.5 (120) → **12** | 13 (120) → **13** | 18 (120) → **18** |
| Pedregulho | 30 | 33 (102) → **33** | 32.5 (102) → **33** | 28 (102) → **28** |
| Ferro | 25 | 25 (112) → **25** | 25 (112) → **25** | 25 (112) → **25** |
| Carvão | 18 | 30 (123) → **30** | 26 (123) → **26** | 26 (123) → **26** |
| Petróleo | 10 | 0 (114) → **1** | 1 (114) → **1** | 1 (114) → **1** |
| Ouro | 10 | 10 (112) → **10** | 10 (112) → **10** | 10 (112) → **10** |

Variação entre a 2ª e a 3ª proposta: Comida +5 (38%) · Pedregulho -5 (-15%) · Ferro +0 (0%) · Carvão +0 (0%) · Petróleo +0 (0%) · Ouro +0 (0%).

Validação (limiares da 3ª proposta, partida normal até 15 rodadas):

| Condição | Base | Proposta T=15 |
|---|---|---|
| Comida | 0.0% [0.0–1.9] | 0.0% [0.0–1.9] |
| Pedregulho | 4.5% [2.4–8.3] | 0.0% [0.0–1.9] |
| Ferro | 8.0% [5.0–12.6] | 0.0% [0.0–1.9] |
| Carvão | 63.5% [56.6–69.9] | 0.0% [0.0–1.9] |
| Petróleo | 1.0% [0.3–3.6] | 100.0% [98.1–100.0] |
| Ouro | 18.0% [13.3–23.9] | 0.0% [0.0–1.9] |
| Expansão | 6.0% [3.5–10.2] | 0.0% [0.0–1.9] |
| Limite de rodadas | 0.0% [0.0–1.9] | 0.0% [0.0–1.9] |
| Duração média (rodadas) | 8.88 [8.71–9.06] | 2.17 [2.08–2.25] |

