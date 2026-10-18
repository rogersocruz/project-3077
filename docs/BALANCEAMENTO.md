# Balanceamento — Etapas 0, 1 e 2

Gerado por `npm run sim:balance` (scripts/balance.ts). Seeds 1–1000 em todas as colunas,
4 jogadores, IA normal em todos os assentos (rota sorteada por assento, como nas simulações
anteriores), todas as camadas (cartas, eventos, hexes especiais, conflito, tratados, facções),
facções sorteadas por partida. Taxas com IC 95% de Wilson; médias com IC 95% (1,96·dp/√n).
Variantes = arquivos em `balance/overrides/`; `data/` não foi alterado.

🔴 = fora da meta: rotas 8–20% (nenhuma > 25%) · facções 25±4% · assentos 25±3% · limite de
rodadas 5–15% · hazard 30–50% · Minas ≥ 1 por jogador.

| Coluna | Override |
|---|---|
| baseline | nenhum (baseline-v1) |
| A1 | banca vende no máx. 2 recursos por turno a cada jogador (`bank.maxBuyPerTurn: 2`) |
| A2 | `structures.mine.rarity = 1` (Mina sem Universidade 2) |
| A3 | dano de hazard só por eventos nomeados (`events.hazardTriggers`) |
| A123 | A1 + A2 + A3 |
| A123+B1 | A123 + Helix só nos 2 primeiros Parques (`factions.helix.ability.params.maxParks: 2`) |

| Métrica | baseline | A1 | A2 | A3 | A123 | A123+B1 |
|---|---|---|---|---|---|---|
| **Vitórias por condição** | | | | | | |
| Comida | 🔴 5,0% [3,8–6,5] | 🔴 0,5% [0,2–1,2] | 🔴 1,9% [1,2–2,9] | 🔴 5,9% [4,6–7,5] | 🔴 0,3% [0,1–0,9] | 🔴 0,3% [0,1–0,9] |
| Pedregulho | 🔴 1,5% [0,9–2,5] | 🔴 1,2% [0,7–2,1] | 🔴 0,1% [0,0–0,6] | 🔴 1,4% [0,8–2,3] | 🔴 0,0% [0,0–0,4] | 🔴 0,0% [0,0–0,4] |
| Ferro | 🔴 4,4% [3,3–5,9] | 🔴 3,4% [2,4–4,7] | 🔴 0,3% [0,1–0,9] | 🔴 3,9% [2,9–5,3] | 🔴 0,4% [0,2–1,0] | 🔴 0,4% [0,2–1,0] |
| Carvão | 🔴 42,0% [39,0–45,1] | 🔴 42,6% [39,6–45,7] | 🔴 3,6% [2,6–4,9] | 🔴 41,5% [38,5–44,6] | 9,5% [7,8–11,5] | 9,2% [7,6–11,2] |
| Petróleo | 🔴 4,2% [3,1–5,6] | 🔴 3,1% [2,2–4,4] | 🔴 24,3% [21,7–27,1] | 🔴 4,0% [3,0–5,4] | 🔴 22,9% [20,4–25,6] | 🔴 22,8% [20,3–25,5] |
| Ouro | 🔴 40,4% [37,4–43,5] | 🔴 44,0% [41,0–47,1] | 🔴 70,6% [67,7–73,3] | 🔴 40,2% [37,2–43,3] | 🔴 67,5% [64,5–70,3] | 🔴 68,0% [65,0–70,8] |
| Expansão | 🔴 2,1% [1,4–3,2] | 🔴 1,9% [1,2–2,9] | 🔴 0,0% [0,0–0,4] | 🔴 2,3% [1,5–3,4] | 🔴 0,0% [0,0–0,4] | 🔴 0,0% [0,0–0,4] |
| Alvo de tribo | 🔴 2,1% [1,4–3,2] | 🔴 3,2% [2,3–4,5] | 🔴 0,1% [0,0–0,6] | 🔴 2,4% [1,6–3,5] | 🔴 0,4% [0,2–1,0] | 🔴 0,4% [0,2–1,0] |
| Eliminação total | 0,0% [0,0–0,4] | 0,0% [0,0–0,4] | 0,0% [0,0–0,4] | 0,0% [0,0–0,4] | 0,0% [0,0–0,4] | 0,0% [0,0–0,4] |
| **Vitórias por facção (% das partidas em que jogou)** | | | | | | |
| Revolucionários | 🔴 17,9% [15,1–21,0] | 🔴 17,6% [14,8–20,7] | 🔴 19,7% [16,8–22,9] | 🔴 18,3% [15,5–21,5] | 🔴 19,5% [16,7–22,8] | 🔴 19,5% [16,7–22,8] |
| Governo Intergaláctico | 22,6% [19,6–25,9] | 22,8% [19,8–26,1] | 🔴 29,7% [26,4–33,2] | 22,6% [19,6–25,9] | 27,5% [24,2–30,9] | 27,5% [24,2–30,9] |
| Consórcio Helix | 🔴 53,1% [49,3–56,9] | 🔴 50,1% [46,4–53,9] | 🔴 34,3% [30,8–37,9] | 🔴 52,7% [48,9–56,4] | 🔴 37,5% [34,0–41,3] | 🔴 37,4% [33,8–41,1] |
| Vantage Dynamics | 🔴 20,4% [17,5–23,6] | 22,3% [19,3–25,7] | 26,3% [23,1–29,8] | 🔴 20,2% [17,3–23,5] | 23,9% [20,8–27,3] | 23,9% [20,8–27,3] |
| Piratas da Fenda | 🔴 16,9% [14,3–20,0] | 🔴 17,4% [14,7–20,4] | 🔴 20,8% [17,9–24,1] | 🔴 17,1% [14,4–20,1] | 21,3% [18,4–24,6] | 21,5% [18,5–24,7] |
| Nativos de Aurum | 🔴 18,7% [15,9–21,8] | 🔴 19,4% [16,6–22,6] | 🔴 19,3% [16,4–22,4] | 🔴 18,7% [15,9–21,8] | 🔴 20,3% [17,4–23,5] | 🔴 20,3% [17,4–23,5] |
| **Vitórias por assento (ordem de turno)** | | | | | | |
| Assento 1 | 22,6% [20,1–25,3] | 23,8% [21,3–26,5] | 23,3% [20,8–26,0] | 22,4% [19,9–25,1] | 22,5% [20,0–25,2] | 22,7% [20,2–25,4] |
| Assento 2 | 22,2% [19,7–24,9] | 23,1% [20,6–25,8] | 24,6% [22,0–27,4] | 22,1% [19,6–24,8] | 22,8% [20,3–25,5] | 22,6% [20,1–25,3] |
| Assento 3 | 26,1% [23,5–28,9] | 25,0% [22,4–27,8] | 25,8% [23,2–28,6] | 26,0% [23,4–28,8] | 26,9% [24,2–29,7] | 26,9% [24,2–29,7] |
| Assento 4 | 🔴 29,1% [26,4–32,0] | 🔴 28,1% [25,4–31,0] | 26,5% [23,9–29,3] | 🔴 29,5% [26,8–32,4] | 28,0% [25,3–30,9] | 28,0% [25,3–30,9] |
| **Duração e limite** | | | | | | |
| Duração média (rodadas) | 8,65 [8,49–8,82] | 8,77 [8,60–8,94] | 5,83 [5,72–5,95] | 8,62 [8,45–8,78] | 6,40 [6,26–6,55] | 6,42 [6,27–6,56] |
| Partidas no limite de rodadas | 🔴 0,4% [0,2–1,0] | 🔴 1,3% [0,8–2,2] | 🔴 0,0% [0,0–0,4] | 🔴 0,4% [0,2–1,0] | 🔴 0,0% [0,0–0,4] | 🔴 0,0% [0,0–0,4] |
| **Hazards** | | | | | | |
| Hazard atingido (% das partidas, média dos hazards) | 🔴 87,8% [87,0–88,6] | 🔴 88,1% [87,3–88,8] | 🔴 71,5% [70,5–72,6] | 🔴 58,7% [57,6–59,9] | 45,8% [44,7–47,0] | 45,9% [44,8–47,1] |
| **Estruturas por jogador (fim da partida)** | | | | | | |
| Minas | 🔴 0,10 [0,08–0,12] | 🔴 0,04 [0,03–0,05] | 1,61 [1,56–1,65] | 🔴 0,10 [0,08–0,11] | 🔴 0,77 [0,74–0,80] | 🔴 0,77 [0,74–0,80] |
| Universidades | 0,10 [0,09–0,11] | 0,10 [0,09–0,11] | 0,07 [0,06–0,08] | 0,10 [0,09–0,11] | 0,06 [0,06–0,07] | 0,06 [0,06–0,07] |
| Mercados | 0,00 [-0,00–0,00] | 0,00 [-0,00–0,00] | 0,00 [0,00–0,00] | 0,00 [-0,00–0,00] | 0,00 [0,00–0,00] | 0,00 [0,00–0,00] |
| **Comprado na banca por partida (unidades, todos os jogadores)** | | | | | | |
| Comida | 2,17 [1,72–2,63] | 0,07 [0,04–0,10] | 1,50 [1,11–1,90] | 2,54 [2,03–3,04] | 0,03 [0,00–0,06] | 0,03 [0,00–0,06] |
| Pedregulho | 15,01 [14,48–15,53] | 11,07 [10,70–11,44] | 23,40 [22,62–24,18] | 15,02 [14,49–15,55] | 10,62 [10,20–11,04] | 10,65 [10,23–11,07] |
| Ferro | 4,54 [4,24–4,84] | 2,41 [2,24–2,59] | 6,66 [6,37–6,96] | 4,53 [4,23–4,83] | 1,92 [1,80–2,04] | 1,92 [1,79–2,04] |
| Carvão | 0,65 [0,55–0,75] | 0,47 [0,41–0,53] | 0,20 [0,14–0,27] | 0,68 [0,58–0,78] | 0,20 [0,15–0,24] | 0,20 [0,15–0,24] |
| Petróleo | 0,18 [0,13–0,23] | 0,12 [0,09–0,15] | 0,22 [0,18–0,27] | 0,17 [0,12–0,22] | 0,16 [0,13–0,19] | 0,16 [0,13–0,19] |
| Ouro | 0,51 [0,45–0,57] | 0,44 [0,38–0,50] | 0,29 [0,25–0,34] | 0,50 [0,44–0,56] | 0,26 [0,23–0,30] | 0,26 [0,22–0,30] |

<!-- LEITURA -->
## Etapa 0 — linha de base limpa

**(a) "Guardião Desperto nunca dispara" — bug do relatório, corrigido.** A carta resolve na hora
em que sai do Tesouro (interpretação AO) e nunca passa pela mão, então o simulador só a contava
como comprada. Agora `guardianSpawned` logo depois do `treasureDrawn` conta como jogada
(`src/sim/game.ts`). No baseline: 1.008 Guardiões sorteados e 1.008 ativados, em 3.443
escavações. Fica um ponto em aberto: o texto da carta diz "sem tropas, avança para um hex
adjacente", e isso não está implementado; é preciso decidir para qual hex adjacente ele vai.

**(b) Partidas que terminam na rodada 1 — não é bug; a causa é o desenho do jogo.** No baseline,
15 partidas (1,5%) acabam na rodada 1 e 28 (2,8%) até a rodada 2, quase todas por Ouro.
Reexecutei as seeds 29, 66 e 177 e encontrei duas causas:
1. Templo ou Ruína vizinhos da própria Vila (o GDD 3.2 permite; o hex já começa revelado e em
   alcance). O jogador escava no primeiro turno e tira 2 ou 3 Cofres Precursores (4 Ouro cada;
   5 das 15 cartas do Tesouro). Com o Ouro inicial, passa do limiar de 10.
2. Seed 177 (Comida na rodada 1): o jogador tem estrutura no Porto Franco, que zera o spread
   da banca (interpretação AL). Com isso, 1 Ouro do Cofre vira 6 Comida pelo valor cheio, e
   ele chega a 40.

Nada foi alterado em `data/`. Correções possíveis, todas como override, a testar: Cofre com
2 Ouro; proibir sítio a distância 1 da Vila no setup; ou Porto Franco com spread 1 em vez de 0.

**(c) "Difícil" e "normal" com 452 vitórias cada — não é bug do bot nem do relatório.**
- Nas mesmas seeds, trocando os dois níveis de assento, o assento vencedor não mudou em 12 de
  12 partidas, e 4 delas saíram idênticas.
- Medindo decisão a decisão, a "difícil" escolhe outra ação em 15,1% das decisões da fase de
  Ações. O bot está ligado, só muda pouco o resultado.
- No relatório anterior, cada nível ocupava um assento fixo, então as vitórias por nível são
  as vitórias dos assentos 2 e 3. O empate exato é coincidência (≈1% de chance).
- Confronto direto, 400 partidas com a "difícil" girando de assento (1 difícil + 3 normais):
  difícil 21,8% [18,0–26,1], normal 26,1% [23,7–28,6]. **A "difícil" não é mais forte que a
  normal** com todas as camadas ligadas. Isso é uma regressão desde a Fase 5, quando era 40%
  contra 29% só com Economia e Cartas. Fica registrado para a IA; não foi corrigido.

## Etapas 1 e 2 — leitura

- **A1 (banca vende no máx. 2 por turno):** quase não muda o jogo. Corta a rota de Comida
  (5,0% → 0,5%), porque comprar Comida em volume era o caminho. Carvão e Ouro seguem dominando
  (~43% cada) e a duração não muda.
- **A2 (Mina sem Universidade):** muda tudo. Minas por jogador vão de 0,10 para 1,61 (única
  coluna que bate a meta ≥ 1), mas as partidas encurtam (8,7 → 5,8 rodadas) e o **Ouro dispara
  para 70,6%** (o subsolo de Ouro é garantido em todo tabuleiro). Carvão cai para 3,6% e
  Petróleo sobe para 24%. Helix cai de 53% para 34%: a renda das Minas pesa mais que a dos
  Parques.
- **A3 (hazard só por evento nomeado):** baixa os hazards atingidos de 87,8% para 58,7% sem
  mudar o resto. Ainda fica acima da meta de 30–50%.
- **A123:** hazards em 45,8% (dentro da meta) e Carvão em 9,5% (dentro), mas o Ouro fica em
  67,5% e as Minas em 0,77 por jogador (o limite da banca corta a compra de Pedregulho e Ferro
  para construí-las).
- **A123+B1 (Helix só nos 2 primeiros Parques):** **quase sem efeito**. Só 58 das 1.000
  partidas mudam; a Helix vai de 37,5% para 37,4%. A Helix tem em média 1,66 Parques e só 22%
  dos assentos dela passam de 2: a vantagem vem justamente dos primeiros Parques. Para mexer
  na Helix é preciso cortar no começo (por exemplo, "só a partir da rodada 3" ou "+1 em vez de
  nível 2").

**Fora da meta em todas as colunas:**
- Limite de rodadas: 0–1,3%, contra a meta de 5–15%. As partidas acabam cedo demais.
- Mercados: 0,00 por jogador; a IA nunca constrói Mercado.
- A rota Ouro passa de 25% em todas; Comida, Pedregulho, Ferro e Expansão ficam abaixo de 8%
  em todas.
- Assento 4 (último a jogar) vence 28–29%, 🔴 fora da meta de 25±3 no baseline, A1 e A3
  (último a agir antes da verificação do fim da rodada).
- Helix: 🔴 em todas as colunas (34–53%).

Nenhuma variante foi aplicada a `data/`.
<!-- /LEITURA -->
