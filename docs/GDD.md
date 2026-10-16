# PROJETO 3077 — GDD (Game Design Document) Digital v1.0

> Regras completas e consolidadas para a versão digital.
> **Fonte da verdade numérica:** `data/*.json`. Este documento descreve regras;
> números citados aqui são exemplos — o motor sempre lê dos JSON.
> Itens marcados **[PROV]** são provisórios e serão calibrados por simulação.

---

## 1. Visão geral

**Ano 3077.** Um planeta com características semelhantes à Terra é encontrado. Seis
grupos independentes, sem autoridade central, pousam em regiões diferentes e correm
para explorar, extrair e dominar seus recursos — negociando, sabotando e guerreando
entre si.

| Campo | Valor |
|---|---|
| Gênero | 4X (eXplore, eXpand, eXploit, eXterminate) com interação por cartas e negociação |
| Jogadores | 3–6 (humanos em hotseat e/ou IA) |
| Duração alvo digital | 45–90 min com IA em velocidade normal [PROV] |
| Perspectiva | Mesa 3D (três dimensões) vista de cima, câmera orbital livre |
| Plataforma | Navegador desktop; empacotável como app desktop |
| Idiomas | PT-BR (português do Brasil, padrão) e EN (inglês) |

### Os quatro eixos do jogo
O jogo tem quatro eixos de peso comparável. A identidade final fica em aberto até o
balanceamento por simulação mostrar qual domina.

| Eixo | Mecânicas |
|---|---|
| Território | Ocupação, limite de 3 espaços por hex, construção por tropa, tarifa de fronteira |
| Alcance e informação | Raio de construção, sondagem, Drone, Posto de Observação, subsolo oculto |
| Negociação | Câmbio livre, banca como piso e teto, tratados SE/ENTÃO, pactos |
| Interação por cartas | Entrega no fim do turno, sabotagem, permanentes roubáveis |

---

## 2. Componentes digitais

| Componente | Quantidade | Arquivo de dados |
|---|---|---|
| Tabuleiros hexagonais (aresta 4 = 37 hexes) | 1 por jogador | `balance.json` |
| Baralho geral de tiles | 37 × nº de jogadores | `tiles.json` |
| Baralhos de ação n1 / n2 / n3 | 3 | `cards.json` |
| Baralho de eventos globais | 1 | `events.json` |
| Baralho de tesouro | 1 | `cards.json` (tipo treasure) |
| Estruturas | 11 tipos × 3 níveis | `structures.json` |
| Tropas | 2 papéis × 3 níveis | `balance.json` |
| Recursos | 6 | `resources.json` |
| Facções | 6 | `factions.json` |
| Tratados | modelos + árvore | `treaties.json` |

---

## 3. Mapa

### 3.1 Tabuleiros
Cada jogador tem um tabuleiro hexagonal macro de **aresta 4 (37 hexes)**; opção
"mapa longo" com aresta 5 (61 hexes). Fórmula: `hexes = 3n² − 3n + 1`.

Tabuleiros se conectam **aresta com aresta**, em layouts pré-definidos por número de
jogadores (roseta). Coordenadas internas: **axiais (q, r)** por tabuleiro, mais um
`boardId`. Adjacência entre tabuleiros vem do layout.

### 3.2 Montagem (setup)
1. Monta-se o **baralho geral de tiles** conforme `tiles.json`.
2. Embaralha-se com a **seed** da partida.
3. Cada jogador recebe 37 tiles, distribuídos nas posições do seu tabuleiro.
4. Garantias de setup, aplicadas por re-sorteio local:
   - mínimo de **3 hexes de Comida** por tabuleiro;
   - mínimo de **1 depósito de Ouro no subsolo** por tabuleiro.
5. **Hazards são únicos no planeta** — existe um só Vulcão, um só Porto Franco etc.
6. Quem termina o setup **sem nenhum hex especial** recebe compensação
   (`balance.json → setup.noSpecialCompensation`).
7. Cada jogador escolhe o hex inicial do **Centro da Vila** dentro de uma zona
   central permitida (anel interno do próprio tabuleiro).

### 3.3 Névoa
Todo hex começa **oculto**, exceto o hex da Vila e seus adjacentes. Superfície é
revelada por **Explorar**; subsolo por **Sondar**. Hexes revelados ficam visíveis a
todos os jogadores (informação pública), subsolo sondado fica visível só a quem sondou
**[PROV — decidir se público]**.

---

## 4. Hexes

### 4.1 Terreno comum (superfície)

| Hex | Produz (com Parque) | Regra |
|---|---|---|
| Vazio | — | Pode ter subsolo |
| Floresta | Comida | |
| Lagoa | Comida + Pedregulho | Única fonte dupla |
| Montanha | Pedregulho (exige **Pedreira**, não Parque) | Movimento custa 2 Comida por tropa |
| Veio exposto | Ferro, Carvão **ou** Ouro (definido no tile) | |

### 4.2 Subsolo (verso do tile)
Petróleo · Carvão · Ouro · Ferro · Pedregulho · Vazio, com pesos em `tiles.json`.

Explorar o subsolo exige **Sondar** (1 ação) e depois construir **Mina**.
A Mina produz com **multiplicador** e consome **Carvão** por turno para operar
(fase de Manutenção). Cada Mina tem **4 tokens de esgotamento** [PROV]; ao zerar, a
Mina é removida e o subsolo fica esgotado.

> **Resolução de conflito:** versões antigas falavam em "Energia". Não existe recurso
> Energia. **Todo custo e produção de "Energia" é Carvão.**

### 4.3 Hexes especiais

Padrão obrigatório: **BÔNUS PASSIVO** + **GATILHO** (categoria de evento) + **DANO**.

**Sítios** (vários no baralho):

| Hex | Recompensa | Risco |
|---|---|---|
| Templo | Ação **Escavar**: compra 2 cartas de Tesouro. Depois vira Vazio | Pode despertar **Guardião** (força 4) |
| Ruína | 1 carta de Tesouro ao escavar + bônus passivo permanente: +1 compra de carta por turno e acesso ao baralho n3 sem Universidade 3 | Gatilho **Horda**: a horda emerge ali |

**Hazards** (únicos no planeta):

| Hex | Bônus | Gatilho | Dano |
|---|---|---|---|
| Vulcão | Produz Carvão sem Mina | Térmico | Cinzas: hex e adjacentes não produzem por 2 rodadas |
| Geiser | Minas adjacentes operam sem Carvão | Sísmico | Seca por 3 rodadas |
| Pântano Ácido | Comida em dobro | Climático | Contamina; 2 ações para limpar |
| Cânion de Ventos | Drones que partem daqui são gratuitos | Atmosférico | Nenhum Drone do dono pode ser usado |
| Crosta Fina | Sondagem grátis, Mina mais barata, multiplicador +1 | Sísmico | Mina colapsa, subsolo selado por 3 rodadas |
| Porto Franco | Comércio com a banca sem spread; comércio com qualquer jogador ignora fronteira | Econômico | Fecha por 3 rodadas, spread do dono dobra |
| Anomalia Magnética | Sabotagem não pode alvejar este hex nem adjacentes | Atmosférico | Inverte: hex e adjacentes recebem cartas com efeito dobrado |

Além destes, **Montanha** comum tem bônus de alcance (Posto em Montanha = raio 4) e é
afetada por eventos Sísmicos (deslizamento).

### 4.4 Regra de dano de desastre
- Escopo: **hex do desastre + adjacentes**. Nunca o tabuleiro inteiro.
- Todos os edifícios sofrem **downgrade de 1 nível**; edifícios de nível 1 são
  **destruídos**, exceto o Centro da Vila.
- O Centro da Vila na área **perde 1 vida**.
- Desastre **não** afeta permanentes (tecnologias e relíquias).
- Sem proteção de início de jogo: construir perto de Vulcão é aposta assumida.

---

## 5. Recursos e economia

### 5.1 Recursos

| Recurso | Valor base | Uso exclusivo |
|---|---|---|
| Comida | 1 | Criar e **mover** tropas |
| Pedregulho | 2 | Muro, equipamento de Escavação, base de construção |
| Ferro | 2 | Tropas, construções intermediárias |
| Carvão | 3 | Operar Minas, Drone |
| Petróleo | 6 | Drone de longo alcance, cartas pesadas |
| Ouro | 6 | Tratados, Universidade, Pesquisa Avançada, lastro do câmbio |

Regra de valor: **valor = escassez × usos exclusivos**.

### 5.2 Banca
Disponível sempre, no Centro da Vila. **Compra pelo valor −1, vende pelo valor +1**
(spread 2). Troco arredonda **a favor da banca**. O **Mercado** reduz o spread do dono
em 1 por nível [PROV].

### 5.3 Comércio entre jogadores
Livre, instantâneo, por escambo ou lastreado em ouro, **a qualquer momento da fase de
Ações do jogador ativo**. No digital: o jogador ativo abre uma proposta; o destinatário
aceita, recusa ou contrapropõe. Em hotseat, a proposta usa tela de privacidade.
Só mudam de mão: **recursos, cartas e permanentes**.

### 5.4 Fronteira
Cada jogador declara publicamente uma **tarifa de fronteira** (um tipo de recurso),
alterável só no início da rodada. Cada tropa que entra no seu território paga **1
unidade** desse recurso ao dono. Cartas e permanentes podem adicionar **recursos
diferentes** à tarifa, com teto de **2 modificadores** por fronteira.

---

## 6. Rodada e turno

### 6.1 Rodada
```
INÍCIO  → revela o Evento Global (fica visível a rodada inteira)
TURNOS  → cada jogador, em ordem, executa as 7 fases
FIM     → resolve tratados com prazo, verifica condições de vitória
```

### 6.2 Turno — 7 fases

| # | Fase | O que acontece |
|---|---|---|
| 1 | **Revelação** | Cartas recebidas de outros jogadores são viradas e resolvidas, na ordem de entrega |
| 2 | **Compra** | Compra cartas conforme a tabela da Universidade (6.4) |
| 3 | **Produção** | Parques, Pedreiras e Minas produzem. Automático |
| 4 | **Manutenção** | Minas pagam Carvão; Mina sem Carvão não produz no próximo turno |
| 5 | **Ações** | Gasta até **3 ações** [PROV]. Cartas próprias e movimento acontecem aqui |
| 6 | **Combate** | Resolve todo hex com tropas de mais de um jogador |
| 7 | **Entrega** | Entrega até 1 carta a **outro** jogador; descarta até o limite de mão |

Fases 1–4 e 6 são automáticas no digital, com animação. O jogador só decide nas fases
5 e 7 (e em escolhas pontuais pedidas por cartas).

### 6.3 Ações (fase 5)

| Ação | Custo em ações | Custo em recursos | Regra |
|---|---|---|---|
| Explorar | 1 | — | Revela 1 hex adjacente a qualquer hex revelado seu, no próprio tabuleiro |
| Sondar | 1 | — | Revela o subsolo de 1 hex dentro do raio |
| Construir | 1 | custo da estrutura | Hex dentro do raio **ou** hex próprio com tropa sua; respeita limite de 3 espaços |
| Melhorar | 1 | custo de upgrade | Exige Oficina para níveis 2 e 3 |
| Escavar | 1 | 1 Pedregulho | Templo ou Ruína em alcance |
| Recrutar | 1 | custo da tropa | No hex do Quartel ou adjacente |
| Instalar permanente | 1 | custo da carta | Ocupa 1 dos 5 slots |
| Mudar tarifa | 0 | — | Só no início da rodada |
| Mover tropas | **0** | Comida | Ver 8.3 |
| Comerciar | **0** | — | Banca ou jogadores |
| Jogar carta própria | 0 (salvo se a carta disser) | custo da carta | |

### 6.4 Compra por Universidade

| Universidade | Opções por turno (escolher uma linha) |
|---|---|
| Sem Universidade | 1 carta n1 |
| Nível 1 | 1 carta n1 |
| Nível 2 | 2 cartas n1 · **ou** · 1 carta n2 |
| Nível 3 | 3 cartas n1 · **ou** · 1 n2 + 1 n1 · **ou** · 1 carta n3 |

Mão inicial **3**, limite **6** (ampliável pelo Arquivo). Descarte no fim do turno.

### 6.5 Raio de construção e alcance

| Origem | Raio |
|---|---|
| Centro da Vila | 2 |
| Posto de Observação | 2 |
| Posto de Observação em Montanha | 4 |
| Drone n1 / n2 / n3 | +1 / +2 / +3 sobre qualquer origem |

Limite de Postos: **nível da Vila + 1**. Raio **não** atravessa fronteira para
construir — só Drone e cartas com alcance DRONE/GLOBAL atingem outros tabuleiros.

### 6.6 Limite de espaços
**Cada hex tem 3 espaços.** Tropas e estruturas ocupam 1 espaço cada.
Muro ocupa espaço. O Centro da Vila ocupa 1.

---

## 7. Cartas

### 7.1 Categorias por timing

| Categoria | Quem joga | Quando resolve | Moldura |
|---|---|---|---|
| **Carta própria** | Você, para você | Na hora, fase 5 | Oliva |
| **Carta entregue** | Você, para outro jogador | Início do turno do alvo (fase 1) | Vermelha |
| **Tecnologia** | Você, instalando | Permanente, ocupa slot | Azul aço |
| **Contrato / Pacto** | Dois jogadores | Conforme gatilho / contínuo | Dourada |
| **Relíquia** | Vem do Tesouro | Permanente, ocupa slot | Violeta |
| **Evento** | O mundo | Início da rodada | Horizontal, cor da categoria |

Restrições: Sabotagem **nunca** para si mesmo. **Teto de recebimento: 2 cartas por
jogador por rodada** (excedente descartado, o remetente é avisado).

### 7.2 Anatomia de dados de uma carta
`id · nome · nível (n1–n3) · tipo · categoria · subtipo (Benefício/Sabotagem/Informação/Logística/Política) · alvo · alcance (PRÓPRIO/RAIO N/DRONE/GLOBAL) · duração · custo · efeito (texto) · effectId (gancho do motor)`

### 7.3 Custos
Três eixos combináveis: **recurso**, **descarte de cartas**, **compensação** (o alvo ou
um oponente compra N cartas). Escala de pontos em `balance.json → costPoints`, faixas:
n1 = 0–3, n2 = 4–8, n3 = 9–18.

### 7.4 Permanentes
**5 slots fixos por jogador, públicos.** Tecnologias e Relíquias disputam os mesmos
slots. Instalar com slots cheios exige desinstalar um (sai do jogo).
- **Engenharia Reversa** destrói um permanente alheio.
- **Espionagem Industrial** rouba: troca forçada — você pega o dele e descarta um seu.
- **Contraespionagem** (tecnologia) impede roubo, só destruição.

---

## 8. Tropas e combate

### 8.1 Papéis

| Papel | Força base | Ocupa hex | Especial |
|---|---|---|---|
| Linha | 3 | Sim | Segura território |
| Artilharia | 2 | Não conta para ocupação | Apoia combates a até 2 hexes sem sofrer baixas |

Nível 2 e 3 (via Oficina) somam +1 de força cada. Teto de exército: **nível do Quartel × 3**.

### 8.2 Custos
Linha: 1 Ferro + 1 Comida. Artilharia: 2 Ferro + 1 Comida. **Sem manutenção.**

### 8.3 Movimento
- **1 Comida move 1 tropa 1 hex.** Sem ação, sem limite de distância.
- Montanha custa 2 Comida por tropa.
- Entrar em território alheio paga a tarifa do dono, por tropa.
- Parar em hex com tropa inimiga gera combate na fase 6.

### 8.4 Combate (fase 6, determinístico)

| Passo | Regra |
|---|---|
| 1. Apoio | Artilharias a até 2 hexes somam força. Máx. 3 por combate. Cada uma apoia 1 combate por turno. Não sofrem baixas |
| 2. Soma | Tropas no hex + apoio + modificadores |
| 3. Resultado | Maior vence. Empate: cada lado perde 1 tropa, ninguém ocupa |
| 4. Baixas | Perdedor remove tropas até a força removida ≥ diferença; o **dono escolhe** quais (IA/auto: as mais fracas primeiro) |
| 5. Recuo | Sobreviventes do perdedor recuam 1 hex, sem custo |
| 6. Ocupação | Vencedor ocupa se tiver ≥ 1 Linha no hex |

**Modificadores** (teto **+4** positivo no total):
defensor no próprio tabuleiro +1 · formação 2 defensores +1 / 3 defensores +2 ·
Muro +2 · adjacente a Posto do defensor +1 · atacante cruzou fronteira nesta rodada −1.

Artilharia alcançada por Linha inimiga no próprio hex luta com metade da força.
Três ou mais jogadores: o maior vence; cada perdedor sofre baixas iguais à própria
diferença para o vencedor.

### 8.5 Ocupação e Vila
Ocupar um hex alheio permite **extrair o recurso dele** na sua fase de Produção
enquanto houver Linha sua ali. Tropa sua no hex da Vila inimiga ao **fim da rodada**,
sem defensor vivo, tira **1 vida** (máx. 1 por rodada).

---

## 9. Eventos globais
Um por rodada, revelado no início. Categorias: **Sísmico, Térmico, Climático,
Atmosférico, Horda, Econômico**. Montagem do baralho da partida: máximo **2 cartas por
categoria** no baralho ativo [PROV]. Todo evento morde **por terreno** ou cria uma
**escolha** — nunca subtração uniforme. Lista em `events.json`.

---

## 10. Tratados
**Custo: 1 Ouro de cada participante, cobrado só no aceite.** Propor é grátis.

**Regra de ouro:** só mudam de mão **recurso, carta e permanente**.

| Tipo | Formato | Duração |
|---|---|---|
| Contrato | SE (gatilho) → ENTÃO (consequência) | Dispara uma vez |
| Pacto | Estado contínuo | 5 rodadas ou até quebra |

- Gatilho pode citar qualquer jogador; consequência obriga só um dos assinantes.
- Validação na **assinatura**: o construtor nunca oferece combinação inválida.
- "SE NÃO" tem prazo: fim da próxima rodada.
- Quebra de pacto: quem rompe descarta a mão e perde 1 ação.
- Inadimplência: paga o que puder e perde 1 ação.
- Máximo 2 tratados ativos por jogador. Tratado não pode apontar para tratado.
Árvore completa e modelos prontos em `treaties.json`.

---

## 11. Estruturas
Lista, custos, raridade (desbloqueio) e funções em `structures.json`.

| Raridade | Desbloqueio |
|---|---|
| r1 | Desde o início |
| r2 | Universidade nível 2 |
| r3 | Universidade nível 3, ou Ruína controlada |

---

## 12. Facções
Seis facções, cada uma com cor, símbolo geométrico, posição na bússola moral
(narrativa, sem efeito de regra), **uma habilidade** e uma personagem conselheira
(usada em diálogos e tutorial). Dados em `factions.json`.

---

## 13. Vitória e derrota

### 13.1 Vitória (todas públicas, com trilha visível no HUD — Heads-Up Display)
- **Acúmulo** de um recurso até o limiar daquele recurso [PROV — limiares em `balance.json`]
- **Expansão:** estruturas em N hexes distintos [PROV: 15]
- **Alvo de tribo:** reduzir a Vila da facção-alvo sorteada a 1 vida e mantê-la assim ao
  fim de uma rodada, por mão própria
- **Eliminação total** de todos os adversários

Quando alguém atinge uma condição, **a rodada termina** e só então se verifica.
Empate: maior progresso percentual somado nas trilhas.
**Limite de rodadas** [PROV: 15]: ao atingir, vence o maior progresso percentual.

### 13.2 Derrota
Única condição: **Centro da Vila com 0 vidas**. A Vila tem 3 vidas; upgrade de Vila
regenera 1 vida por nível subido, sem passar de 3.
Jogador eliminado: **[PROV]** opção de regra no setup — "sai da partida" (padrão) ou
"vira facção neutra controlada pela IA".

---

## 14. Modos de jogo digitais

| Modo | Descrição |
|---|---|
| Partida rápida | Você + IA, regras padrão |
| Hotseat | 2–6 humanos no mesmo dispositivo, tela de privacidade entre turnos |
| Tutorial | Campanha guiada de 8 lições com seed fixa |
| Laboratório | Ferramenta de design: liga/desliga camadas de regra, edita números ao vivo, roda N partidas IA × IA e exporta estatísticas |
| Online | **Fora do escopo v1** (arquitetura preparada) |

**Camadas de regra** ligáveis no setup (espelha a ordem de entrada do jogo físico):
Economia (sempre) · Eventos · Hexes especiais · Cartas · Conflito · Artilharia ·
Tratados · Facções assimétricas.
