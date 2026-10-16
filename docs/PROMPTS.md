# PROJETO 3077 — Roteiro de prompts para o Claude Code

Uma fase por sessão. Cole o prompt da fase, deixe o Claude Code planejar, aprove,
revise o resultado e faça commit antes da próxima. Entre fases, comece uma conversa
nova para não carregar contexto velho.

## Duas rotas

| Rota | Fases | Resultado | Esforço estimado* |
|---|---|---|---|
| **Rápida** | 0 → 5 | Mesa 3D jogável em hotseat com economia e cartas, IA básica e **simulador para calibrar os números do jogo físico** | 3–5 fins de semana |
| **Completa** | 0 → 13 | Jogo completo: todas as camadas, menus, tutorial, arte, áudio, app desktop | 3–6 meses |

\* Estimativa grosseira para o seu ritmo (fins de semana + algumas noites). A maior
incerteza está nas fases 7–9 (combate, tratados, IA).

**Recomendação:** faça a rota rápida inteira antes de decidir pela completa. A fase 5
(simulador) vale mais para o jogo físico do que todas as fases visuais juntas — ela
fecha os números que estão em aberto desde o começo do projeto.

---

## Prompt de abertura (colar no início de qualquer sessão)

```
Leia CLAUDE.md, docs/DECISOES_ABERTAS.md e a seção "Estado atual" do CLAUDE.md.
Vamos executar a fase indicada abaixo de docs/PROMPTS.md.
Entre em modo de planejamento: leia os documentos que a fase cita, me apresente o
plano (arquivos a criar/alterar, riscos, o que fica fora) e espere minha aprovação.
```

---

## FASE 0 — Fundação

```
FASE 0 — Fundação do projeto.

Crie o projeto com a stack definida no CLAUDE.md (Vite + TypeScript strict + React +
React Three Fiber + drei + postprocessing + Zustand + GSAP + Zod + i18next + Howler +
Vitest + Playwright + ESLint + Prettier). Estruture as pastas exatamente como em
CLAUDE.md > Arquitetura.

Entregáveis:
1. Esquemas Zod para cada arquivo em data/ e o script `npm run data:check`, que valida
   todos os JSON e falha listando cada erro com caminho do campo.
2. `engine/rng.ts` com seed e testes de determinismo.
3. `engine/hex.ts`: coordenadas axiais, vizinhos, distância, hexes em raio, geração de
   tabuleiro de aresta N (3n²−3n+1 hexes) e layouts de roseta para 3–6 jogadores
   (tabuleiros encostados aresta com aresta). Testes cobrindo contagem e adjacência
   entre tabuleiros.
4. `src/ui/theme/tokens.ts` com toda a paleta de docs/ART_DIRECTION.md seção 2 e as
   fontes da seção 3 (servidas localmente).
5. Esqueleto de i18n com pt-BR.json e en.json.
6. Uma página inicial simples mostrando "PROJETO 3077" com a tipografia e as cores
   do tema, para validar o pipeline.
7. Scripts npm listados no CLAUDE.md (os que ainda não fazem nada retornam
   "não implementado").

Critérios de aceite: `npm run test`, `npm run lint` e `npm run data:check` passam;
`npm run dev` abre a página; capture uma tela com Playwright e confira o visual.
Atualize "Estado atual" no CLAUDE.md e faça commit.
```

---

## FASE 1 — Motor: setup e economia (Camada 0)

```
FASE 1 — Motor de regras, camada de Economia. Sem interface nesta fase.

Leia docs/GDD.md seções 3, 4.1, 4.2, 5, 6 e 11. Implemente em src/engine/:
1. Estado da partida (state.ts) e ações (actions.ts) para: Explorar, Sondar, Construir,
   Melhorar, Comerciar com a banca, Comerciar com jogador (proposta/aceite/recusa),
   Encerrar fase.
2. setup.ts: baralho geral de tiles a partir de data/tiles.json (pesos, sítios
   escalados por nº de jogadores, hazards únicos), distribuição por seed, garantias de
   setup (3 hexes de Comida, 1 Ouro no subsolo por tabuleiro), compensação de quem fica
   sem especial, escolha da Vila no anel central.
3. Máquina de fases (phases.ts) com as 7 fases do turno e a rodada. Nesta fase, as fases
   de Revelação, Combate e Entrega existem mas não fazem nada.
4. Produção (Parque, Pedreira, Mina com multiplicador, tokens e upkeep de Carvão),
   raio de construção (Vila, Posto, Montanha), limite de 3 espaços por hex,
   limite de Postos, banca com spread e arredondamento a favor da banca.
5. legal.ts: lista de ações legais com motivo de cada ação ilegal (para a interface
   explicar "por que não posso").
6. Vitória por acúmulo de recurso e por expansão; limite de rodadas; desempate.
7. Camadas de regra como flags no estado (economy sempre ligada; as demais desligadas
   até suas fases).

Todo número vem de data/balance.json. Teste cada regra citando a seção do GDD.
Inclua um teste de determinismo: 2 partidas com a mesma seed e mesmo log produzem
estados idênticos.

Critério de aceite: um teste roda uma partida de 3 jogadores inteira com ações
aleatórias legais (via rng com seed) até alguém vencer ou o limite de rodadas, sem
exceção e sem estado inválido. Commit.
```

---

## FASE 2 — Mesa 3D

```
FASE 2 — Renderização 3D do estado. Leia docs/ART_DIRECTION.md seções 5, 6, 8.

Em src/render3d/, renderize uma partida gerada pelo motor (seed fixa, 4 jogadores):
1. Mesa de madeira, iluminação noturna quente (luz principal cima-esquerda,
   preenchimento frio), sombras suaves.
2. Tiles hexagonais: prisma com bisel, base escura, topo com textura. Use instanciamento
   de malhas. Até existir arte, gere texturas procedurais por terreno no estilo pintado
   (gradientes, ruído, pequenos detalhes) — nada de cor chapada crua.
3. Névoa: tile oculto = verso metálico com grade e "?".
4. Hazards com filete dourado no bisel.
5. Estruturas low-poly procedurais por tipo, com faixas na cor da facção e anéis de
   nível na base. Centro da Vila mais detalhado.
6. Tropas (Linha e Artilharia) como miniaturas estilizadas com estrelas de nível.
7. Bandeja de cada jogador à frente do tabuleiro: estoque como pilhas de tokens 3D
   (formas e cores de ART_DIRECTION 2.4) e 5 slots de permanentes.
8. CameraRig: órbita, zoom, pan, limites de pitch, foco por jogador (teclas 1–6,
   Espaço = meu tabuleiro), interpolação suave.
9. Raycast: passar o mouse destaca o hex; clicar seleciona e emite evento para a UI.
10. Pós-processamento (bloom em emissivos, vinheta, SMAA) com interruptores.

Critério de aceite: 60 FPS em notebook comum com 6 jogadores (aresta 4); capturas de
tela de visão geral, close de um tabuleiro e close de um hex com estrutura, conferidas
contra ART_DIRECTION. Commit.
```

---

## FASE 3 — HUD e partida jogável (vertical slice)

```
FASE 3 — Primeira partida jogável em hotseat com a camada de Economia.
Leia docs/UX_SPEC.md seções 2.5, 2.6, 2.10, 2.11, 2.15, 4, 5 e 6.

1. HUD completo de UX_SPEC 2.5 (topo com rodada e fases, jogadores com trilhas de
   vitória, registro, recursos, contador de ações, slots, botão de encerrar fase).
   Estilo: placas metálicas chanfradas, papel creme para texto, laranja de destaque.
2. Inspetor de hex com as ações legais vindas de legal.ts, custo e motivo quando ilegal.
3. Destaque de hexes válidos ao escolher uma ação (contorno animado).
4. Banca e comércio entre jogadores, com tela de privacidade em hotseat.
5. Diretor de animação (src/anim/) consumindo eventos do motor: explorar, sondar,
   construir, melhorar, produção em cascata, banca. Fila bloqueia a entrada.
   Velocidade 0.5×/1×/2×/instantânea.
6. Atalhos de teclado de UX_SPEC 5.
7. Tela de fim de partida simples (vencedor e condição).
8. Todos os textos em pt-BR.json.

Critério de aceite: teste Playwright que joga 2 rodadas de uma partida de 3 jogadores
pela interface; você joga uma partida inteira manualmente sem travar.
Capturas de tela do HUD em 1920×1080 e 1366×768. Commit.
```

---

## FASE 4 — Cartas

```
FASE 4 — Sistema de cartas. Leia GDD seção 7, ART_DIRECTION seção 4, UX_SPEC 2.7–2.9.

1. Componente `ui/card/Card.tsx` que gera a face em SVG exatamente pela anatomia de
   ART_DIRECTION 4: moldura, header na cor da categoria, selo de nível, área de
   ilustração, fita do tipo, painel creme com linha de custo (ícones) e texto com
   palavras-chave em negrito, etiqueta de versão. Versos por baralho.
   O mesmo SVG vira textura (CanvasTexture) para as cartas 3D.
   Use como referência visual as 4 cartas da v0.3: Logística Orbital (Tecnologia),
   Bomba de Íons (Carta entregue), Retirada Estratégica (Carta própria),
   Contrato de Tarifa Preferencial (Contrato).
2. Baralhos n1/n2/n3 a partir de data/cards.json (cópias), compra pela tabela da
   Universidade com escolha de linha, mão inicial, limite, descarte.
3. Cartas próprias na fase 5; cartas entregues na fase 7 com teto de recebimento,
   revelação na fase 1 do alvo.
4. Registro de efeitos em engine/effects/ para TODAS as cartas de cards.json que não
   dependem de camadas futuras (tropas, tratados, tesouro: deixar handler que lança
   "camada desligada" e o data:check aceita). Teste para cada efeito.
5. Permanentes: 5 slots públicos, instalar, desinstalar, destruir, roubo com troca
   forçada, Contraespionagem.
6. Interface: mão em leque, hover, arrastar para alvo, zoom com paralaxe, alcance
   desenhado no mapa, entrega com envelope e drone, revelação com virada.
7. Substituto procedural de ilustração por categoria enquanto não houver arte.

Critério de aceite: partida hotseat com Economia + Cartas jogável do início ao fim;
capturas de tela de cada categoria de carta lado a lado, comparadas com as cartas da
v0.3. Commit.
```

---

## FASE 5 — IA básica e Laboratório (fim da rota rápida)

```
FASE 5 — IA heurística e simulador. Leia UX_SPEC 2.18 e DECISOES_ABERTAS seção 2.

1. src/ai/: agente que escolhe entre as ações de legal.ts por pontuação heurística
   (progresso em trilhas de vitória, valor de recursos pela tabela, risco).
   Três níveis: Fácil (aleatório ponderado), Normal (guloso de 1 passo),
   Difícil (busca rasa de 2 ações). Avalia propostas de comércio por valor numérico.
2. `npm run sim`: roda N partidas IA × IA sem renderização, com seeds sequenciais, e
   gera relatório CSV + resumo no terminal: vitórias por condição, por posição de turno,
   duração em rodadas, recursos mais produzidos e trocados, cartas mais e menos jogadas,
   % de partidas que bateram o limite de rodadas.
3. Tela "Laboratório" no jogo: edita todos os números de balance.json ao vivo
   (sem salvar no arquivo, com botão "exportar balance.json"), liga/desliga camadas,
   roda simulação com barra de progresso e mostra os gráficos.
4. Modo espectador: assistir partida só de IA na mesa 3D.

Critério de aceite: 200 partidas de 4 jogadores rodam em menos de 2 minutos;
relatório gerado. Rode a simulação com os valores atuais e me traga um resumo:
quais rotas de vitória dominam, quais nunca acontecem, e sugestões de ajuste para
os itens D1–D7 de DECISOES_ABERTAS — sem alterar balance.json sem minha aprovação.
Commit.
```

---

## FASE 6 — Eventos, hazards, sítios e tesouro

```
FASE 6 — O planeta reage. Leia GDD seções 4.3, 4.4 e 9; data/events.json e tiles.json.

1. Baralho de eventos ativo montado no setup (máx. por categoria do balance.json),
   revelação no início da rodada com cinemática de UX_SPEC 2.14.
2. Todos os effectIds de events.json e dos hazards de tiles.json, com testes.
3. Regra de dano de desastre (GDD 4.4), incluindo perda de vida da Vila.
4. Templo e Ruína: ação Escavar, baralho de Tesouro, Guardião Desperto como tropa
   hostil neutra (combate entra na fase 7 — até lá, Guardião resolve com regra
   simplificada documentada), bônus passivo da Ruína.
5. Eventos com contra-ação ("quem gastar 1 ação fica imune") como ação no legal.ts.
6. Animações de UX_SPEC 6 para cada categoria de evento, respeitando "reduzir movimento".
7. IA passa a considerar risco de hazard ao construir.

Critério de aceite: testes de todos os efeitos; simulação mostra a % de partidas em que
cada hazard é atingido (responde D15). Commit.
```

---

## FASE 7 — Tropas e combate

```
FASE 7 — Conflito. Leia GDD seção 8 inteira.

1. Quartel, recrutar Linha e Artilharia, teto de exército, níveis via Oficina.
2. Movimento pago em Comida, custo de Montanha, tarifa de fronteira declarada e
   modificadores de tarifa (teto 2), construção em hex com tropa própria.
3. Combate determinístico completo: apoio de artilharia (máx. 3), modificadores com
   teto +4, baixas (escolha do dono; IA e automático escolhem as mais fracas), recuo,
   ocupação, artilharia alcançada em melee, combate com 3+ jogadores.
4. Ocupação extrai recurso; ataque à Vila tira 1 vida por rodada.
5. Guardião e Horda passam a usar o combate real.
6. Painel de resolução de combate passo a passo (UX_SPEC 2.13) e animações.
7. Previsão de combate antes de confirmar o movimento.
8. IA militar: avalia ataques com a previsão de combate.
9. Teste reproduzindo o exemplo trabalhado do GDD 8.4.

Critério de aceite: o exemplo do GDD dá exatamente o resultado documentado;
simulação mostra quantas partidas terminam por eliminação e alvo de tribo. Commit.
```

---

## FASE 8 — Tratados e negociação

```
FASE 8 — Tratados. Leia GDD seção 10 e data/treaties.json.

1. Motor: contratos SE/ENTÃO e pactos, validação na assinatura, gatilhos negativos com
   prazo, inadimplência, quebra de pacto, limite de 2 ativos, cobrança de Ouro só no
   aceite, proibição de tratado apontando para tratado.
2. Construtor de tratado guiado (UX_SPEC 2.12) com revisão em linguagem natural e os
   modelos prontos do treaties.json.
3. Faixa dourada de tratados ativos em cada bandeja; animações de assinatura e disparo.
4. IA: aceita ou recusa tratados por valor estimado; propõe apenas os modelos prontos.
5. Hotseat: proposta e resposta com tela de privacidade.

Critério de aceite: teste para cada gatilho e consequência; partida com tratado de
Tarifa Preferencial disparando corretamente. Commit.
```

---

## FASE 9 — Facções, vitória completa e fim de partida

```
FASE 9 — Facções e encerramento. Leia GDD 12 e 13; data/factions.json.

1. Habilidades das 6 facções como effectIds, ligadas pela camada "Facções assimétricas".
2. Condição de alvo de tribo (sorteio com alvos distintos), eliminação total, regra do
   eliminado configurável.
3. Trilhas de vitória no HUD com alerta acima de 80%.
4. Tela de fim de partida completa (UX_SPEC 2.16): classificação, gráficos por rodada,
   linha do tempo, exportar log.
5. Simulação comparando facções (taxa de vitória por facção).

Critério de aceite: nenhuma facção acima de 25% de vitórias em 500 partidas de
4 jogadores — se acontecer, reportar sem corrigir sozinho. Commit.
```

---

## FASE 10 — Menus, configurações, save e áudio

```
FASE 10 — Casca do jogo. Leia UX_SPEC seções 1, 2.1–2.4, 3, 9 e ART_DIRECTION 9.

1. Splash, menu principal com a mesa 3D em órbita lenta, setup de partida completo
   (UX_SPEC 2.3) com prévia do layout e estimativa de duração, tela de carregamento.
2. Pausa com salvar/carregar/configurações/regras.
3. Configurações completas de UX_SPEC 3: vídeo/tela, áudio, jogabilidade, controles
   (atalhos remapeáveis), acessibilidade (modos daltônicos com padrões, alto contraste,
   tamanho de texto, reduzir movimento, legendas). Detecção automática de qualidade.
4. Save/load pelo log de ações (UX_SPEC 9), salvamento automático, 10 espaços.
5. Áudio: gerenciador com canais, música por estado (menu, exploração, tensão),
   efeitos substitutos via jsfxr para todos os eventos de UX_SPEC 6, e
   public/audio/audio-manifest.json listando cada som para troca futura.

Critério de aceite: todas as opções de configuração têm efeito verificável; salvar,
fechar e carregar reproduz a partida exatamente. Commit.
```

---

## FASE 11 — Tutorial, diálogos e Codex

```
FASE 11 — Ensinar o jogo. Leia UX_SPEC seções 2.17, 7 e 8.

1. Sistema de diálogo com retrato e balão; personagens de UX_SPEC 7.2 com ~12 linhas
   cada (expandir a partir dos exemplos, mantendo as vozes); narrador de UX_SPEC 7.1.
2. Campanha de 8 lições com seed fixa, IA roteirizada, destaques e objetivos,
   botão "Já sei isso", progresso salvo.
3. Dicas contextuais nas 3 primeiras partidas.
4. Codex completo: cartas (renderizadas com o componente real), hexes, estruturas,
   facções com lore, regras com busca.
5. Microtexto de erro sempre explicando o motivo e o que falta (UX_SPEC 7.3).

Critério de aceite: uma pessoa que nunca viu o jogo completa o tutorial sem ajuda
(teste com alguém real). Commit.
```

---

## FASE 12 — Pipeline de arte

```
FASE 12 — Arte. Leia ART_DIRECTION seção 10.

1. Gere public/art/art-manifest.json com uma entrada por asset (cartas, tiles,
   hazards, sítios, facções, conselheiros, eventos, fundo do menu), com id, tipo,
   tamanho e prompt completo = prefixo comum de ART_DIRECTION 10 + campo art.subject
   (ou art.terrain) dos JSON.
2. `npm run art:check` (lista o que falta) e `npm run art:optimize` (converte para
   WebP, redimensiona, gera atlas para tiles).
3. Carregamento: arte real quando existe, substituto procedural quando não.
4. Exporte também um arquivo ART_PROMPTS.md legível, agrupado por tipo, para eu gerar
   as imagens em lote.
5. Opcional: se eu fornecer modelos .glb para estruturas e tropas, troque os modelos
   procedurais mantendo escala, pivô e as faixas de cor da facção.

Critério de aceite: com metade da arte presente, o jogo mistura real e substituto sem
quebra visual. Commit.
```

---

## FASE 13 — Polimento e build

```
FASE 13 — Polimento e distribuição.

1. Completar todas as animações e efeitos de UX_SPEC 6 e ART_DIRECTION 7–8.
2. Desempenho: perfilar com 6 jogadores e aresta 5; meta de 60 FPS em qualidade Alta
   em hardware médio e 30 FPS em Baixa em hardware fraco.
3. Acessibilidade: auditoria de contraste, navegação por teclado em todas as telas,
   leitor de tela nas cartas.
4. Build web de produção e empacotamento desktop com Tauri (Windows e Linux).
5. Página de créditos.

Critério de aceite: build instalável abre, joga uma partida completa e sai sem erros
no console. Commit e tag v1.0.0.
```

---

## Dicas de uso
- Se uma fase ficar grande demais numa sessão, peça: "divida esta fase em subfases e
  execute só a primeira".
- Quando algo visual ficar estranho, cole a captura de tela na conversa e descreva o
  que espera — o Claude Code compara com ART_DIRECTION.
- Depois de cada simulação, leve os números para o jogo físico. O digital existe para
  servir a mesa, não o contrário.
