# PROJETO 3077 — Decisões abertas e conflitos resolvidos

> Tudo que a consolidação para o digital precisou decidir, e tudo que ainda está em
> aberto. O Claude Code deve ler este arquivo antes de implementar regra, e **nunca
> resolver sozinho** um item da seção 2 — usa o valor provisório e deixa configurável.

---

## 1. Conflitos resolvidos na consolidação

| # | Conflito | Resolução adotada |
|---|---|---|
| C1 | "Energia" aparecia em Vulcão, Geiser, Mina e na carta Bomba de Íons, mas não é recurso | **Energia = Carvão** em todo o jogo |
| C2 | Bomba de Íons existia em duas versões: carta física v0.3 (n2, desliga estruturas num hex) e documento (n3, destrói estrutura) | A **carta física é canônica** como "Bomba de Íons" (n2). A versão destrutiva virou **"Ataque Orbital"** (n3) |
| C3 | Universidade era r2 no vocabulário, o que exigiria Universidade 2 para construir a Universidade | **Universidade r1** |
| C4 | Mina era r3: o subsolo só abriria no fim do jogo, e a rota do Ouro morreria | **Mina r2** |
| C5 | Quartel r2 atrasava todo o conflito para depois da Universidade 2 | **Quartel r1** |
| C6 | Tabela de timing citava "fase 4 · Ações"; ações são a fase 5 desde a última revisão | Fase **5** |
| C7 | Ordem de entrada citava Melee e Batedor; tropas foram simplificadas | **Linha** e **Artilharia** |
| C8 | "Sabotagem" era nome de carta e de valência ao mesmo tempo | Carta renomeada para **"Pane Induzida"** |
| C9 | Tratado citava pedágio em Petróleo/Carvão; a tarifa virou declarada | Tarifa **declarada** pelo dono, 1 por tropa |
| C10 | Custos de cartas inventados por Claude (Dossiê, Contrato de Obra, Colapso de Galeria, Silos) fora da faixa de pontos | Ajustados para caber na faixa |

---

## 2. Decisões em aberto (valor provisório no `balance.json`)

| # | Questão | Valor provisório | Como decidir |
|---|---|---|---|
| D1 | Ações por turno | 3 | Simulação: duração e uso das ações |
| D2 | Limite de rodadas | 15 | Simulação: % de partidas que terminam por condição antes do limite |
| D3 | Produção do Parque por nível | 1 / 2 / 3 | Simulação |
| D4 | Multiplicador e tokens da Mina | ×3, 4 tokens | Simulação: rota do Ouro precisa ser possível só com invasão/comércio? |
| D5 | Limiares de vitória por recurso | Comida 40, Pedregulho 30, Ferro 25, Carvão 18, Petróleo 10, Ouro 10 | Simulação: todas as rotas devem vencer entre 10% e 25% das partidas |
| D6 | Expansão | 15 hexes | Simulação |
| D7 | Recursos iniciais | 4 Comida, 4 Pedregulho, 3 Ferro, 1 Carvão, 1 Ouro | Simulação: primeiro turno com escolha real |
| D8 | **Faixa de custo n3** | 9–18 pontos | **Provavelmente alta demais.** Todas as n3 que você desenhou custam ~6. Proposta: baixar para 6–12 |
| D9 | Cartas fora da faixa por decisão sua | Engenharia Reversa (3), Requisição Prioritária (2), Espionagem Industrial (6), Pesquisa Avançada (6), Blindagem Sísmica (6), Propulsão Antigrav (8) | Ou a faixa muda (D8), ou o custo muda. Não alterar sem você |
| D10 | Subsolo sondado é público ou privado? | Privado | Teste de mesa |
| D11 | Regra do jogador eliminado | Sai da partida | Opção no setup; testar a de "facção neutra" |
| D12 | Raio atravessa fronteira para construir? | Não | — |
| D13 | Ataque simultâneo de dois jogadores no mesmo hex | Resolve como combate múltiplo na fase 6 do jogador ativo | Teste |
| D14 | Tropa pode ocupar hex de subsolo alheio (minas)? | Sim | Teste |
| D15 | Frequência de eventos sísmicos | Máx. 2 por categoria no baralho ativo | Simulação: chance real de cada hazard ser atingido |
| D16 | Nomes das corporações | Consórcio Helix, Vantage Dynamics | Sua escolha |
| D17 | Identidade do jogo (frase-régua) | Em aberto | Fechar depois das simulações e playtests |

---

## 3. Riscos do projeto digital

| Risco | Prob. | Mitigação |
|---|---|---|
| Escopo grande demais para terminar | **Alta** | Rota rápida primeiro (fases 0–4). Cada fase entrega algo jogável |
| IA de negociação e tratados | **Alta** | IA v1 só avalia propostas por valor numérico; não propõe tratados complexos |
| Arte pintada vira gargalo | Média | Substitutos procedurais desde o dia 1; arte entra por manifesto |
| Desempenho com 222 tiles + peças | Média | Instanciamento de malhas, texturas em atlas, qualidade ajustável |
| Divergência entre jogo físico e digital | Média | `data/*.json` é a fonte da verdade dos dois; mudou lá, muda nos dois |
