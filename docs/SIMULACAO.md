# PROJETO 3077 — Resultados do simulador (Fase 5)

> Registro das simulações IA × IA que alimentam DECISOES_ABERTAS seção 2. Os números
> vêm de `npm run sim`; o `balance.json` **não foi alterado**. Variantes rodaram com
> `--balance <arquivo>`. Reproduzir: `npm run sim -- --games 200 --players 4 --seed 1`.

## Como ler
- **Camadas:** Economia + Cartas. Eventos, hexes especiais, tropas, tratados e facções
  ainda não têm regra no motor: tudo abaixo vale só para essas duas camadas.
- **IA Normal com rotas sorteadas** (`--style mixed`): cada assento persegue uma condição
  de vitória sorteada. "Pela rota" = a pessoa que perseguiu a condição venceu por ela.
  Com `--style balanced` a IA vai na condição que estiver mais perto.
- A IA é heurística (gulosa de 1 passo, com plano "banca + construir"). Rotas longas
  (Mina: Universidade → Oficina → Universidade 2 → Sondar → Mina) são subestimadas por
  ela; trate Ouro/Petróleo com cautela.
- Desempenho: 200 partidas de 4 jogadores em ~46 s (19 workers); ~1,4 s por partida
  numa thread só.

## Base atual (200 partidas, 4 jogadores, seeds 1–200)

| Vitórias por condição | Rotas sorteadas | Sem foco |
|---|---|---|
| Carvão | **65,0%** | **57,0%** |
| Ouro | 16,0% | 24,5% |
| Expansão | 8,0% | 16,0% |
| Ferro | 7,5% | 1,5% |
| Pedregulho | 4,0% | 1,0% |
| Petróleo | 0,5% | 0,0% |
| Comida | **0,0%** | 0,5% |
| Limite de rodadas | **0,0%** | 0,0% |

- Duração: média 8,9 rodadas (faixa 6–12). Nenhuma partida chega à rodada 15.
- Posição de turno (4 jogadores): 24,0 / 27,5 / 22,5 / 26,0% — equilibrado.
- Minas quase não aparecem (0,07 por jogador no fim); Petróleo produzido ≈ 0.
- Cartas mais jogadas: Comboio, Pilhagem, Pane Induzida. Nunca jogadas: Apoio
  Diplomático (benefício entregue a adversário), Engenharia Reversa e Contraespionagem
  (faltam alvos: quase ninguém instala permanente), Drone 2.

## Variantes (200 partidas, 4 jogadores, rotas sorteadas)

| Variante | Carvão | Ouro | Expansão | Ferro | Pedreg. | Comida | Petróleo | Rodadas |
|---|---|---|---|---|---|---|---|---|
| Base | 65,0 | 16,0 | 8,0 | 7,5 | 4,0 | 0,0 | 0,5 | 8,9 |
| Carvão 24 | 37,5 | 27,5 | 15,5 | 10,5 | — | — | 0,5 | 9,6 |
| Carvão 24 + Comida 30 | 35,5 | 27,5 | 16,0 | 10,5 | 9,0 | 3,0 | 0,5 | 9,5 |
| Expansão 12 hexes | 29,0 | 6,5 | **63,0** | 3,0 | 0,5 | — | — | 7,9 |
| 4 ações por turno | 43,5 | 15,5 | 36,5 | 2,5 | 3,5 | — | — | 8,1 |
| 2 ações por turno | 67,5 | 22,0 | — | 8,0 | 3,0 | — | — | 9,4 |

## Número de jogadores (base, 200 partidas)

| Jogadores | Carvão | Ouro | Expansão | Rodadas | Vitórias por assento |
|---|---|---|---|---|---|
| 3 | 52,0 | 29,5 | 6,5 | 9,1 | 29 / 30 / **41**% |
| 4 | 65,0 | 16,0 | 8,0 | 8,9 | 24 / 27,5 / 22,5 / 26% |
| 6 | 68,5 | 17,0 | 9,5 | 8,5 | 15,5 / 19,5 / 14 / 14,5 / 16 / 20,5% |

Com 3 jogadores o último assento vence bem acima do justo (41% contra 33%). A vitória é
verificada no fim da rodada (interpretação L), e o último assento é quem joga por último
antes da verificação.

## Sugestões para DECISOES_ABERTAS (nada aplicado — decisão sua)

- **D1 Ações por turno (3):** manter. Com 4 ações a Expansão salta para 36,5% e a partida
  encurta; com 2 o Carvão domina ainda mais.
- **D2 Limite de rodadas (15):** nunca é atingido (média ~9). Pode cair para 12 sem efeito
  nas vitórias por condição; serve de rede de segurança.
- **D3 Parque 1/2/3:** sem sinal de problema isolado. O desequilíbrio está nos limiares.
- **D4 Mina ×3, 4 tokens:** a rota da Mina quase não acontece, e o Petróleo só sai de
  Mina. Testar ×4 / 5 tokens exige mudar também `structures.json` (o `data:check` cobra
  coerência); vale testar junto com o custo da Universidade 2. A IA subestima rotas
  longas, então confirmar na mesa.
- **D5 Limiares:** Carvão 18 é baixo demais (≈60% das vitórias). **Carvão 24** derruba
  para ~37% e espalha as vitórias. Comida 40 nunca é atingida: **Comida 30** começa a
  aparecer (3%). Petróleo 10 depende da Mina (ver D4). Meta de 10–25% por rota: Ouro,
  Expansão e Ferro ficam na faixa com Carvão 24; Carvão ainda acima.
- **D6 Expansão 15:** manter (12 vira a rota dominante).
- **D7 Recursos iniciais:** sem leitura direta; o primeiro turno sempre tem construção.
- **Ordem de turno com 3 jogadores:** vantagem do último assento (41%). Pede regra de
  compensação ou checagem de vitória diferente. Decisão de regra, não de número.
- **Cartas:** Apoio Diplomático não tem uso entre adversários sem tratados (Fase 8); rever
  depois dos tratados.

---

## Fase 6 — eventos, hazards e sítios (200 partidas, 4 jogadores, seeds 1–200)

`npm run sim -- --games 200 --players 4 --seed 1 --layers cards,events,specialHexes`
(IA Normal, rotas sorteadas; ~75 s com 19 workers).

**D15 — chance real de cada hazard ser atingido** (baralho ativo de 12 eventos, máx. 2 por
categoria, partidas de ~9 rodadas):

| Hazard | Partidas em que sofreu dano | Vezes por partida |
|---|---|---|
| Pântano Ácido (climático) | 93,5% | 1,73 |
| Porto Franco (econômico) | 92,5% | 1,62 |
| Crosta Fina (sísmico) | 91,5% | 1,65 |
| Geiser (sísmico) | 91,5% | 1,65 |
| Cânion de Ventos (atmosférico) | 86,5% | 1,37 |
| Anomalia Magnética (atmosférico) | 86,5% | 1,37 |
| Vulcão (térmico) | 85,0% | 1,10 |

Leitura: com 2 cartas por categoria e partidas de ~9 rodadas, **quase todo hazard é atingido
em quase toda partida** — o risco deixa de ser aposta e vira certeza. Para o hazard ser uma
aposta (meta sugerida: 40–60%), testar **1 carta por categoria** ou baralho ativo menor.

Outros números: 3,6 desastres por partida, 0,02 eliminações por partida, 3,9 escavações.

**Achado: Cofre Precursor (Tesouro) quebra a rota do Ouro.** O Ouro passou de 16% para 32%
das vitórias, com partidas vencidas já na rodada 2–4: o Cofre dá 4 Ouro (limiar 10), tem 5
cópias no Tesouro de 15, e o Templo dá 2 cartas. Sugestões (nada aplicado): Cofre dar
2 Ouro **ou** 2 Petróleo, ou menos cópias, ou o Templo dar 1 carta.

| Vitórias por condição | Fase 5 (Economia + Cartas) | Fase 6 (+ Eventos + Hexes especiais) |
|---|---|---|
| Carvão | 65,0% | 52,0% |
| Ouro | 16,0% | 32,0% |
| Ferro | 7,5% | 4,5% |
| Comida | 0,0% | 4,0% |
| Petróleo | 0,5% | 3,5% |
| Expansão | 8,0% | 2,5% |
| Pedregulho | 4,0% | 1,5% |
