# PROJETO 3077 — Especificação de Experiência (UX — User Experience)

Telas, fluxos, configurações, controles, animações, diálogos e tutorial.
Todo texto visível vem de `src/i18n/pt-BR.json` (e `en.json`). Nada de texto fixo
no código.

---

## 1. Mapa de telas

```
Boot ─► Splash ─► Menu principal
                   ├─ Continuar            ─► Partida (salva)
                   ├─ Nova partida         ─► Setup ─► Carregamento ─► Partida
                   ├─ Tutorial             ─► Seleção de lição ─► Partida guiada
                   ├─ Laboratório          ─► Editor de regras ─► Simulação / Partida
                   ├─ Codex                ─► Cartas · Hexes · Estruturas · Facções · Regras
                   ├─ Configurações
                   ├─ Créditos
                   └─ Sair (só no app desktop)

Partida ─► Pausa ─► (Retomar · Salvar · Carregar · Configurações · Regras · Sair ao menu)
        ─► Fim de partida ─► Estatísticas ─► Revanche / Menu
```

---

## 2. Telas

### 2.1 Splash (3 s, pulável)
Logo "PROJETO **3077**" em placa metálica que desce sobre a mesa, som de impacto
metálico. Barra de carregamento de assets discreta na base.

### 2.2 Menu principal
- Fundo: a mesa 3D em plano aberto, câmera em órbita lenta sobre uma roseta de
  tabuleiros já montada, iluminação noturna. Partículas de poeira na luz.
- Logo à esquerda; botões empilhados em placas metálicas chanfradas com borda laranja
  no foco.
- Rodapé: versão do jogo, seed do dia (desafio diário — backlog), ícone de idioma.
- Botão **Continuar** só aparece se houver save automático.

### 2.3 Setup de nova partida

| Seção | Controles |
|---|---|
| Jogadores | 3–6 assentos; cada um: Humano / IA (Fácil, Normal, Difícil) / Fechado |
| Facção | Seletor com retrato, símbolo, cor, habilidade, frase de lore. "Aleatória" disponível |
| Mapa | Aresta 4 (padrão) ou 5 · Layout da roseta (prévia 3D) · Seed (campo + dado aleatório) |
| Camadas de regra | Interruptores: Eventos · Hexes especiais · Cartas · Conflito · Artilharia · Tratados · Facções assimétricas |
| Preset | Introdutório (só Economia + Cartas) · Padrão · Completo · Personalizado |
| Vitória | Liga/desliga cada condição; limite de rodadas |
| Avançado | Ações por turno, velocidade da IA, regra do eliminado |

Botão **Iniciar** em laranja. Resumo à direita: duração estimada (calculada a partir de
jogadores, camadas e IA).

### 2.4 Carregamento
Montagem do mapa animada: tiles caem do baralho e se encaixam em espiral, cada
tabuleiro na cor da facção. Dica de regra ou trecho de lore no rodapé (rotativo).

### 2.5 Partida — HUD

```
┌──────────────────────────────────────────────────────────────────────┐
│ RODADA 4/15 │ [EVENTO DA RODADA: carta horizontal mini]  │ ⚙ ⏸ │
│ Fases: ①Revelação ②Compra ③Produção ④Manutenção [⑤AÇÕES] ⑥Combate ⑦Entrega │
├───────────────┬──────────────────────────────────────┬───────────────┤
│ JOGADORES     │                                      │ REGISTRO      │
│ retrato, vida │           MESA 3D                     │ (log da       │
│ trilhas de    │                                      │  partida,     │
│ vitória (%)   │                                      │  filtrável)   │
│ cartas na mão │                                      │               │
├───────────────┴──────────────────────────────────────┴───────────────┤
│ RECURSOS: 🟢 12  ▫ 8  ⬡ 5  ◆ 3  💧 1  ⯃ 2  │ AÇÕES ●●○ │ [BANCA] [COMÉRCIO] [TRATADO] │
│ PERMANENTES: [slot][slot][slot][ ][ ]                                  │
│ MÃO:  [carta][carta][carta][carta]                    [ENCERRAR FASE] │
└──────────────────────────────────────────────────────────────────────┘
```
(Os símbolos acima são ilustrativos; na interface real são ícones vetoriais com forma
e cor — ver ART_DIRECTION 2.4.)

- **Painel de jogadores:** clique foca a câmera no tabuleiro do jogador; passar o mouse
  mostra estoque, tarifa de fronteira, permanentes e tratados ativos.
- **Trilhas de vitória:** barra por condição; a mais próxima de concluir pulsa.
  Ícone de alerta quando qualquer jogador passa de 80% de uma trilha.
- **Mão:** leque na base; passar o mouse levanta e amplia a carta; arrastar para o
  alvo joga; clique direito abre zoom.
- **Botão Encerrar fase:** muda de texto conforme a fase ("Encerrar ações",
  "Entregar e encerrar turno").

### 2.6 Inspetor de hex
Clique em hex abre painel lateral: terreno, subsolo (se conhecido), dono, estruturas
(nível), tropas, espaços ocupados (3 slots visuais), modificadores ativos (hazard,
evento, anomalia), ações possíveis com custo — cada ação é um botão.

### 2.7 Zoom de carta
Carta em tamanho grande no centro, com moldura "PROJETO 3077"; gira levemente com o
mouse (paralaxe). Mostra: texto completo, alvo válido, alcance desenhado sobre o mapa
ao fundo, cópias restantes no baralho, lore curta.

### 2.8 Entrega de carta (fase 7)
Escolher carta → escolher destinatário (retratos dos adversários; os que já receberam
2 nesta rodada aparecem bloqueados com o motivo) → escolher alvo quando a carta exigir
→ confirmar. A carta é lacrada num envelope e um drone a leva até a bandeja do alvo.

### 2.9 Revelação (fase 1 do alvo)
Envelopes chegam ao centro, abrem um por vez; a carta vira com brilho da categoria;
efeito é aplicado no mapa; texto narrado no log ("Revolucionários sabotaram sua Mina
em C-3").

### 2.10 Banca
Modal com dois lados (dar / receber), seletor de quantidade, cotação de compra e venda,
troco perdido sinalizado em vermelho ("arredondado a favor da banca: −2").

### 2.11 Comércio entre jogadores
Proposta em duas colunas (eu dou / eu recebo), aceita recursos, cartas da mão
(mostradas só ao destinatário) e permanentes. Destinatário: Aceitar / Recusar /
Contrapropor. **Hotseat:** tela de privacidade "Passe o dispositivo para {jogador}".
**IA:** responde com balão de diálogo da conselheira da facção.

### 2.12 Construtor de tratado
Árvore guiada em passos (sem campo livre):
1. Tipo: **Contrato** ou **Pacto**
2. (Pacto) Categoria → opção · (Contrato) Quem dispara → O que acontece → Quem paga o quê
3. Revisão em linguagem natural: "SE **Piratas** entrarem no **território** de
   **Revolucionários**, ENTÃO **Piratas** pagam **1 Ferro** por tropa."
4. Enviar proposta. Custo de 1 Ouro de cada aparece em destaque, cobrado só no aceite.
Modelos prontos (como "Contrato de Tarifa Preferencial") aparecem como atalhos.
Tratados ativos ficam numa **faixa dourada** acima da bandeja de cada jogador, com a
cor de quem tem a obrigação e ícone do beneficiário.

### 2.13 Resolução de combate
Painel central automático, passo a passo, com barras de força dos dois lados:
apoio de artilharia entra como blocos, modificadores aparecem um a um (teto +4
mostrado com trava), resultado, baixas (o jogador humano escolhe quais tropas
perder quando houver escolha real), recuo animado.

### 2.14 Evento global (início de rodada)
A mesa escurece, a carta horizontal desliza do baralho para o centro, gira e cresce;
tinta de tela na cor da categoria por 1 s; hexes afetados recebem contorno pulsante.
Depois a carta encolhe para o topo do HUD.

### 2.15 Tela de privacidade (hotseat)
Fundo frame.900, logo da facção do próximo jogador, "Vez de {facção}", botão
"Estou pronto". Esconde mão, subsolo privado e propostas.

### 2.16 Fim de partida
Câmera faz órbita lenta no tabuleiro vencedor; placa metálica "VITÓRIA — {condição}".
Abas: Classificação · Gráficos (recursos por rodada, força militar, cartas jogadas) ·
Linha do tempo (eventos marcantes) · Exportar (JSON — JavaScript Object Notation — do log
para análise). Botões: Revanche (mesma seed), Nova partida, Menu.

### 2.17 Codex
Enciclopédia navegável: todas as cartas (filtros por nível, categoria, subtipo),
hexes, estruturas, facções com lore, regras com busca. Cartas renderizadas com o
mesmo componente do jogo.

### 2.18 Laboratório (ferramenta de design)
- Painel de todos os números de `balance.json`, editáveis ao vivo, com botão "restaurar".
- Interruptores de camada.
- **Simulador:** N partidas IA × IA (padrão 200), seed inicial, velocidade máxima,
  sem renderização. Saída: taxa de vitória por condição, por facção, por posição de
  turno; duração média em rodadas; recurso mais negociado; cartas mais e menos jogadas.
  Exporta CSV (Comma-Separated Values).
- Este modo existe para calibrar os números [PROV] do jogo físico.

---

## 3. Configurações

### 3.1 Vídeo / tela
| Opção | Valores |
|---|---|
| Modo de exibição | Janela · Tela cheia · Janela sem bordas (app desktop) |
| Resolução | Lista do sistema (app desktop); no navegador, escala de renderização |
| Escala de renderização | 50–150% |
| Limite de FPS (quadros por segundo) | 30 · 60 · 120 · 144 · Ilimitado |
| VSync (sincronização vertical) | Liga / Desliga |
| Predefinição de qualidade | Baixa · Média · Alta · Ultra · Personalizada |
| Sombras | Desligadas · Baixa · Alta |
| Antisserrilhado | Desligado · FXAA · SMAA |
| Bloom | Liga / Desliga |
| Profundidade de campo | Liga / Desliga |
| Objetos de ambiente na mesa | Liga / Desliga |
| Partículas | Baixa · Normal · Alta |
| Escala da interface | 80–150% |
| Mostrar contador de FPS | Liga / Desliga |

Detecção automática de qualidade no primeiro boot (medindo FPS por 3 s).

### 3.2 Áudio
Volume geral · Música · Efeitos · Interface · Ambiente · Vozes/diálogos (se houver) ·
Silenciar quando a janela perde o foco.

### 3.3 Jogabilidade
| Opção | Valores |
|---|---|
| Velocidade de animação | 0.5× · 1× · 2× · Instantânea |
| Velocidade da IA | Lenta · Normal · Rápida |
| Confirmar ações irreversíveis | Liga / Desliga |
| Avançar fases automáticas | Liga / Desliga (pausa em cada fase) |
| Desfazer na fase de Ações | Liga / Desliga (desfaz até a última informação nova revelada) |
| Dicas contextuais | Liga / Desliga |
| Mostrar previsão de combate | Liga / Desliga |
| Salvamento automático | A cada turno · A cada rodada · Desligado |
| Idioma | Português (BR) · English |

### 3.4 Controles
Câmera: sensibilidade de órbita, zoom e arraste; inverter eixos; bordas da tela movem
câmera (liga/desliga). **Atalhos remapeáveis** (lista na seção 5).

### 3.5 Acessibilidade
Modo daltônico (Deuteranopia · Protanopia · Tritanopia — reforça padrões e ícones,
não só troca cores) · Alto contraste · Tamanho de texto · Reduzir movimento ·
Desligar tremor de câmera · Legendas para todos os sons relevantes · Leitura de texto
de cartas ao focar (leitor de tela) · Tempo ilimitado em todas as decisões.

---

## 4. Câmera

- Órbita em torno do ponto focado; pitch entre 25° e 80°; zoom entre visão do planeta
  inteiro e um único tile.
- Tecla de foco rápido por jogador (1–6) e "voltar ao meu tabuleiro" (Espaço).
- Durante cinemáticas a câmera interpola suavemente e devolve o controle ao fim.

---

## 5. Atalhos padrão

| Tecla | Ação |
|---|---|
| Botão esquerdo | Selecionar / jogar |
| Botão direito | Zoom de carta / cancelar |
| Arrastar botão do meio / direito | Orbitar |
| Roda | Zoom |
| WASD / setas | Mover câmera |
| Espaço | Focar meu tabuleiro |
| 1–6 | Focar jogador N |
| Enter | Encerrar fase |
| E | Explorar no hex selecionado |
| S | Sondar |
| B | Construir |
| U | Melhorar |
| T | Abrir comércio |
| Y | Abrir tratado |
| M | Abrir banca |
| Tab | Alternar registro |
| Ctrl+Z | Desfazer (quando permitido) |
| Esc | Pausa |
| F1 | Regras rápidas |

---

## 6. Catálogo de animações

| Momento | Animação | Som |
|---|---|---|
| Comprar carta | Carta sai do baralho em arco, vira no ar, entra no leque | deslizar de papel |
| Passar mouse na carta | Levanta 30 px, escala 1.15, inclina na direção do cursor | — |
| Jogar carta própria | Carta voa até o alvo, dissolve em partículas da cor da categoria | whoosh + efeito |
| Entregar carta | Carta dobra em envelope lacrado; drone em miniatura leva até a bandeja do alvo | zumbido de drone |
| Revelar carta recebida | Envelope abre, carta gira 180° com brilho | selo rompendo |
| Explorar | Tile oculto sobe, gira 180°, assenta com quique e nuvem de poeira | batida de papelão |
| Sondar | Anel de varredura se expande do Posto/Vila; tile inclina e mostra o corte do subsolo | ping de sonar |
| Construir | Andaime surge, estrutura sobe do chão com faíscas, bandeira da facção desenrola | martelos + clank |
| Melhorar | Anel luminoso extra na base, coluna de luz breve | acorde ascendente |
| Produção | Tokens saltam dos hexes em cascata e voam até o estoque da bandeja; contador do HUD rola | tilintar metálico |
| Banca | Tokens deslizam entre bandeja e cofre central | caixa registradora futurista |
| Mover tropas | Peças deslizam pelo caminho hex a hex; consumo de Comida aparece como tokens se apagando | passos / esteira |
| Atravessar fronteira | Barreira holográfica pisca; tokens de tarifa voam para o dono | bip de pedágio |
| Combate | Peças avançam, choque com faíscas, barras de força enchem, perdedores caem e somem, sobreviventes recuam | impacto + metal |
| Destruição | Estrutura racha, desaba em blocos e some | desabamento |
| Downgrade | Anel de nível estilhaça | vidro quebrando |
| Vila perde vida | Escudo hexagonal sobre a Vila racha; ícone de vida apaga | alarme grave |
| Instalar permanente | Carta voa para o slot, encaixa com trava mecânica, slot acende | trava metálica |
| Roubo de permanente | Garra mecânica puxa a carta de uma bandeja para outra | puxão |
| Tratado assinado | Duas canetas holográficas assinam; carta dourada vai para a faixa de tratados | assinatura + selo |
| Tratado disparado | Faixa dourada brilha, linha de energia liga os dois jogadores, transferência acontece | sino |
| Evento sísmico | Tremor de câmera, rachaduras nos tiles afetados | rumor grave |
| Evento térmico | Cinzas caindo, tom laranja | erupção abafada |
| Evento climático | Chuva estilizada nos tiles | chuva |
| Evento atmosférico | Distorção de ar, ruído na interface por 1 s | vento + estática |
| Horda | Silhuetas escuras emergem do hex de origem | rugido |
| Templo — Guardião | Pedra rachando, figura luminosa se ergue | coro grave |
| Vitória | Bandeira gigante da facção sobe sobre a roseta, confete metálico | fanfarra |

---

## 7. Diálogos e voz da interface

### 7.1 Narrador (abertura e eventos)
Tom: documentário de colonização, sóbrio, com leve ironia.

- **Abertura:** "Ano 3077. Um planeta azul aparece nos registros de uma sonda esquecida.
  Seis expedições partem antes que alguém consiga reivindicá-lo. Nenhuma pretende dividir."
- **Primeira rodada:** "As cápsulas tocaram o solo. O que vocês constroem hoje decide
  quem escreve o nome deste mundo."
- **Evento sísmico:** "O planeta lembra a todos que estava aqui primeiro."
- **Evento econômico:** "Os preços sobem quando a confiança desce."
- **Horda:** "Algo vivia nas ruínas. Agora sabe que vocês chegaram."
- **Vitória por acúmulo:** "{facção} não conquistou o planeta. Comprou."
- **Vitória por expansão:** "Onde se olha, há uma bandeira de {facção}."
- **Vitória por alvo de tribo:** "Uma rivalidade antiga terminou do jeito que começou."
- **Eliminação:** "A Vila de {facção} cai em silêncio. O planeta não percebe."

### 7.2 Conselheiras e conselheiros de facção
Cada facção tem uma personagem que fala nas dicas, nas respostas de comércio da IA e
no tutorial. Retrato em busto, balão no canto inferior esquerdo.

| Facção | Conselheiro(a) | Voz |
|---|---|---|
| Revolucionários | **Tenente Inara Vex** | Inflamada, direta, odeia corporações |
| Governo Intergaláctico | **Comissário Aldren Hale** | Burocrático, protocolar, cita regulamentos |
| Consórcio Helix | **Diretora Selene Okafor** | Fria, fala em métricas e margens |
| Vantage Dynamics | **Dr. Marlow Kade** | Cientista ambicioso, curioso, sem escrúpulos |
| Piratas da Fenda | **Capitã Rook "Ferrugem" Daly** | Debochada, pragmática, adora um bom roubo |
| Nativos de Aurum | **Guardiã Teyra** | Calma, enigmática, fala do planeta como ser vivo |

Linhas de exemplo (cada personagem precisa de ~12: saudação, aceitar comércio, recusar
comércio, contraproposta, receber sabotagem, sabotar, vencer combate, perder combate,
evento, tratado aceito, tratado quebrado, vitória):

- **Inara Vex — recusar comércio:** "Fazer negócio com acionista? Prefiro passar fome."
- **Aldren Hale — tratado aceito:** "Protocolo 7-B registrado. Que conste em ata."
- **Selene Okafor — contraproposta:** "Sua oferta tem margem negativa para nós. Ajuste em 2 Ferro."
- **Marlow Kade — sondar Templo:** "Uma estrutura anterior a nós. Fascinante. E lucrativa."
- **Rook Daly — roubar permanente:** "Bela tecnologia. Ficou melhor do meu lado da mesa."
- **Guardiã Teyra — evento sísmico:** "Ela se mexe porque vocês pesam demais sobre ela."

### 7.3 Microtexto de interface
- Ação impossível sempre explica o motivo e o que falta:
  "Não é possível construir: hex fora do raio. Um Posto em C-4 alcançaria."
- Custos não pagos aparecem em vermelho com o déficit: "Falta 1 Ferro".
- Nunca "Erro". Sempre linguagem do mundo do jogo.

---

## 8. Tutorial — campanha de 8 lições

Seed fixa, mapa reduzido (2 ou 3 jogadores), IA roteirizada, conselheira guia
(Comissário Hale por padrão — o mais didático). Cada lição destrava o próximo
interruptor de camada, espelhando a ordem de entrada do jogo físico.

| # | Lição | Ensina | Objetivo |
|---|---|---|---|
| 1 | Pouso | Câmera, hex, Vila, raio | Explorar 3 hexes |
| 2 | Primeiras fundações | Construir Parque, Produção, recursos | Ter produção de 2 recursos |
| 3 | O que há embaixo | Sondar, Mina, Carvão, esgotamento | Construir uma Mina |
| 4 | A banca e o vizinho | Banca, spread, comércio entre jogadores | Fazer uma troca vantajosa |
| 5 | Conhecimento é poder | Universidade, cartas próprias e entregues, slots | Instalar uma Tecnologia e entregar uma Sabotagem |
| 6 | O planeta reage | Eventos, hazards, Templo e Guardião | Escavar um Templo sobrevivendo ao Guardião |
| 7 | Fronteira | Tropas, Comida como combustível, tarifa, combate | Vencer um combate e ocupar um hex |
| 8 | Palavra assinada | Tratados SE/ENTÃO e pactos | Assinar um tratado e vencer a partida curta |

Regras do tutorial:
- Destaque visual só no elemento relevante; o resto escurece levemente.
- Nunca bloquear o jogador por mais de 2 cliques de instrução seguidos.
- Botão "Já sei isso" pula a lição e marca como concluída.
- Dicas contextuais continuam ativas nas primeiras 3 partidas fora do tutorial.

---

## 9. Salvamento
- Salvamento automático conforme configuração; 10 espaços manuais.
- O save é o **log de ações + seed + versão das regras** (a partida é reconstruída
  reexecutando o log). Garante determinismo e replays.
- Save de versão de regras diferente abre com aviso e opção de "rodar com regras da
  época".

---

## 10. Estados de erro e borda
- Perda de foco da janela: pausa automática da IA.
- Asset de arte faltando: substituto procedural, nunca imagem quebrada.
- Partida sem jogador humano (só IA): permitido no Laboratório e como "espectador".
- Desempenho baixo detectado (FPS < 30 por 5 s): sugerir reduzir qualidade.
