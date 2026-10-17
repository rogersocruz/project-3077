# PROJETO 3077 — Instruções do projeto para o Claude Code

Jogo digital 3D (três dimensões) de tabuleiro e cartas, adaptação do board game 4X
"Projeto 3077". Leia este arquivo inteiro no início de toda sessão.

## Documentos de referência (ler conforme a fase)
- `docs/GDD.md` — regras completas. **Autoridade sobre regras.**
- `docs/DECISOES_ABERTAS.md` — conflitos resolvidos e decisões em aberto. **Nunca
  resolver sozinho um item em aberto**: usar o valor provisório e deixar configurável.
- `docs/ART_DIRECTION.md` — paleta, tipografia, anatomia da carta, estilo 3D, animação.
- `docs/UX_SPEC.md` — telas, HUD, configurações, atalhos, animações, diálogos, tutorial.
- `docs/PROMPTS.md` — roteiro de fases. Trabalhar **uma fase por sessão**.
- `data/*.json` — **fonte da verdade de todos os números e conteúdos.**

## Stack (fixa — não trocar sem pedir)
| Camada | Tecnologia |
|---|---|
| Linguagem | TypeScript em modo `strict` |
| Build / dev server | Vite |
| Interface 2D | React + CSS Modules, tokens de tema em `src/ui/theme/tokens.ts` |
| Cena 3D | three.js via React Three Fiber, `@react-three/drei`, `@react-three/postprocessing` |
| Estado de interface | Zustand |
| Animação | GSAP (3D e DOM), com timelines orquestradas pelo diretor de animação |
| Validação de dados | Zod (esquemas para cada `data/*.json`) |
| Internacionalização | i18next + react-i18next (pt-BR padrão, en) |
| Áudio | Howler.js; efeitos substitutos gerados com jsfxr |
| Testes | Vitest (motor, IA), Playwright (fluxos e capturas de tela) |
| Qualidade | ESLint + Prettier |
| App desktop (fase final) | Tauri |

Usar as versões estáveis atuais de cada pacote no momento da instalação.

## Arquitetura
```
src/
  engine/        Motor de regras PURO: sem React, sem three, sem DOM, sem Math.random
    state.ts       Tipos do estado da partida
    actions.ts     União discriminada de todas as ações de jogador
    reducer.ts     applyAction(state, action) → { state, events[] }
    phases.ts      Máquina de fases da rodada e do turno
    legal.ts       Geração de ações legais (usada pela UI e pela IA)
    rules/         economy, build, cards, permanents, events, hazards, combat, treaties, victory
    effects/       registry.ts: effectId → handler (cada carta/evento/hazard)
    hex.ts         Matemática axial (q, r), vizinhança, distância, raio, layout de roseta
    rng.ts         RNG (gerador de números aleatórios) com seed (mulberry32 ou similar)
    setup.ts       Montagem determinística da partida a partir da seed
  ai/            Agentes heurísticos (fácil/normal/difícil), só consomem legal.ts
  sim/           Simulador sem renderização (CLI `npm run sim`) para o Laboratório
  data/          Carregamento + esquemas Zod dos JSON da raiz `data/`
  render3d/      Cena: Table, Board, HexTile, Structure, Troop, Token, CardMesh, CameraRig, Fx
  anim/          Diretor de animação: consome eventos do motor → timelines GSAP
  ui/            Telas, HUD, modais, componentes; `ui/card/Card.tsx` gera a face em SVG
  audio/         Gerenciador de som, mapa evento → som
  i18n/          pt-BR.json, en.json
  save/          Salvamento = seed + versão das regras + log de ações
  settings/      Configurações persistidas (localStorage no navegador)
```

### Regras de arquitetura (não negociáveis)
1. **O motor é puro e determinístico.** Mesma seed + mesmo log de ações = mesmo
   estado, sempre. Toda aleatoriedade passa por `engine/rng.ts`.
2. **O motor nunca espera animação.** Ele aplica a ação e emite `events[]`. O diretor de
   animação toca os eventos; a interface bloqueia entrada enquanto há fila.
3. **Nenhum número de regra no código.** Tudo vem de `data/balance.json` e dos JSON.
4. **Nenhum texto visível no código.** Tudo vem de `src/i18n/*.json`.
5. **A interface e a IA perguntam ao `legal.ts`** o que é permitido. Nenhuma regra é
   reimplementada na interface.
6. **Toda carta, evento e hazard é um `effectId`** registrado em `engine/effects/`. Um
   `effectId` desconhecido falha no carregamento dos dados, não no meio da partida.
7. **Arte ausente nunca quebra o jogo**: substituto procedural no estilo.

## Convenções
- Código e identificadores em inglês; textos de jogo em PT-BR via i18n.
- Componentes React pequenos; lógica fora de componentes.
- Cada regra nova vem com teste no Vitest citando a seção do GDD.
- Nada de `any`. Nada de `Math.random` fora de `rng.ts`.
- Cores só via tokens de tema (`ART_DIRECTION.md` seção 2).

## Comandos
```
npm run dev          servidor de desenvolvimento
npm run build        build de produção
npm run test         Vitest
npm run test:e2e     Playwright
npm run lint         ESLint
npm run sim -- --games 200 --players 4 --seed 1   simulação IA × IA sem renderização
npm run data:check   valida data/*.json contra os esquemas e effectIds
npm run art:check    lista arte faltante do manifesto
```

## Como trabalhar
- Comece cada fase em **modo de planejamento**: leia os documentos da fase, proponha o
  plano, espere aprovação.
- Ao terminar: rode testes, lint e `data:check`; para mudanças visuais, rode o
  Playwright, **tire capturas de tela e olhe para elas** antes de declarar pronto.
- Atualize a seção "Estado atual" abaixo e faça um commit por fase.
- Se uma regra do GDD parecer contraditória, **pare e pergunte** — não invente.

## Estado atual
- Fase concluída: 5 — IA básica e Laboratório (fim da rota rápida)
- Próxima fase: 6 — Eventos, hazards, sítios e tesouro
- IA e Laboratório (Fase 5):
  - Jogar contra a IA: Nova partida → assento Humano/IA Fácil/Normal/Difícil (ou URL
    `seats=human,normal,hard`); só IA (espectador): `ai=all|easy|normal|hard`. Laboratório:
    Home → "Laboratório" ou `/?view=lab`. Simulador: `npm run sim -- --games 200 --players 4
    --seed 1 [--level easy,normal,hard] [--style mixed|balanced] [--layers cards,specialHexes]
    [--balance arquivo.json] [--workers N] [--out sim-out]` → `sim-out/` (fora do git).
  - IA (`src/ai/`): `chooseAction(ctx, state, agent)` escolhe entre `legalActions`/
    `checkAction` (nunca reimplementa regra). `evaluate.ts` = valor do estado em pontos de
    recurso (estoque, trilhas, renda futura, capacidades, sítios abertos, cartas); pesos em
    `weights.ts` (gosto da IA, não regra). Explorar/Sondar/Comprar valem pelo valor
    esperado de tiles.json (`expect.ts`): a IA não espia o escondido (teste). Plano
    "banca + construir" quando só falta recurso. Fácil = sorteio ponderado; Normal =
    guloso 1 passo; Difícil = 2 ações + escolhe a rota mais promissora a cada turno.
    Trocas: aceita se ganha valor e não entrega vitória; propõe 1:1 no máximo 1×/turno.
    Medido: Difícil 40% > Normal 29% > Fácil ~1% por assento.
  - Simulador (`src/sim/`): `game.ts` (uma partida + registro), `run.ts` (lote, balance
    validado, fatias), `report.ts` (resumo, CSV), `worker.ts` (Web Worker do Laboratório);
    `scripts/sim.ts` + `sim-worker.ts` (worker_threads). `--style mixed` sorteia uma rota
    por assento para medir cada condição. 200 partidas/4 jogadores ≈ 46 s.
  - Resultados e sugestões para D1–D7: **`docs/SIMULACAO.md`** (balance.json intocado).
  - Interface: `ui/game/aiDriver.ts` joga pela sessão quando a fila para (pausa trava;
    `T.aiThink`); selo "IA" no painel, "{facção} está pensando…" na barra. Diretor:
    `director.setHumans(mask)` — privacidade só para pessoas; com uma pessoa só, a tela fica
    com ela; só IA, a tela segue quem decide e relatórios de carta não esperam clique.
    `canDecideNow`/`useCanDecide` exigem assento humano.
  - Laboratório (`ui/screens/Lab.tsx`, `ui/lab/`): edita todo número/booleano de
    balance.json (rascunho em localStorage `p3077.lab.balance`, nunca no arquivo), selo PROV,
    valor original ao lado, restaurar, exportar; camadas; simulação em Web Workers com
    progresso, gráficos de barras, tabelas e download de CSV/resumo.
  - Desempenho do motor: `applyAction` não copia mais o log inteiro a cada ação;
    `maxLevelOf` varre sem montar lista. (Teste: `structuredClone` segue no reducer — uma
    cópia JSON manual deixou o V8 mais lento no jogo real.)
  - Testes: `ai/agent.test.ts` (partidas nos 3 níveis, determinismo, não espiar, trocas),
    `sim/report.test.ts`, `e2e/ai.spec.ts` (Laboratório, espectador até o fim, pessoa × IA;
    capturas `screenshots/phase5-*`).
  - Fora da fase: IA de tropas/combate (7) e tratados (8; validade do tratado será lógica
    de regra no motor, não IA), Laboratório jogar partida com o balance editado, gráficos
    por facção (facções na Fase 9; hoje assento = facção).
- Cartas (Fase 4):
  - Jogar: `/?view=game&players=3&seed=1` (camada de cartas ligada por padrão; `cards=0`
    desliga; também na Nova partida). Galeria de desenvolvimento: `/?view=cards`
    (`set=ref|all|backs`, `blocked=1`, `raster=1`).
  - Motor: `engine/rules/cards.ts` (compra pela tabela da Universidade com escolha de linha,
    jogar, instalar, entregar com teto de recebimento, revelar na fase 1 do alvo),
    `rules/decks.ts` (baralhos n1/n2/n3 por cópias, limite de mão, descarte),
    `rules/permanents.ts` (5 slots). Efeitos em `engine/effects/` por arquivo
    (resources, structures, permanents, info, modifiers, decks, world); efeitos de
    camadas futuras em `effects/gated.ts` (recusam com "camada desligada").
  - Face da carta: `ui/card/Card.tsx` (SVG, anatomia de ART_DIRECTION 4), versos em
    `CardBack.tsx`, ilustração substituta procedural por categoria em `Illustration.tsx`;
    o mesmo SVG vira textura 3D (`ui/card/rasterize.ts`, `texture.tsx`).
  - Interface: mão em leque (`ui/hand/`), zoom com paralaxe, diálogo de alvo/entrega,
    voos de carta, envelope + drone na entrega, revelação com virada (`anim/cues.ts`).
  - Interpretações provisórias da Fase 4 (isoladas; **revisar com o usuário**):
    S) Demolição: Muro/Posto no hex absorvem e sofrem downgrade (`absorbedBy`);
    T) RAIO N de carta = área a partir da Vila/Posto, atravessa fronteira
       (`cards.radiusCrossesBorder`); DRONE entregue = tabuleiro do alvo; GLOBAL = qualquer;
    U) cartas de camadas desligadas (tropas, tratados, eventos) ficam fora do baralho;
    V) baralho vazio rebaralha o próprio descarte; W) mão inicial do
       `setup.startingHandDeck` (n1); X) alvo escolhido na entrega; se deixou de valer
       até a Revelação, a carta "falha" (`cardFizzled`); Y) Pilhagem: remetente escolhe o
       recurso, alvo perde o que tiver até 2, remetente ganha 1 se houve perda;
    Z) Sobrecarga: produz de novo na hora e fica inativa na próxima Produção;
    AA) Colapso de Galeria: dono limpa gastando 2 ações; AB) Bomba de Íons desliga
       estruturas com manutenção em Carvão de qualquer dono até o fim da rodada;
    AC) Terraformação: +N em cada recurso que o hex produz; AD) Pesquisa Avançada ainda
       exige Oficina; AE) Silos: empate vai para o recurso de maior valor;
    AF) Espionagem sem slot livre: o remetente descarta o permanente escolhido na entrega;
    AG) Arquivo amplia o limite pelo maior nível; AH) Contrato de Obra: metade de cada
       recurso, arredondado para cima; AI) desfazer cobre Instalar, não Jogar/Entregar.
  - Testes: `effects/effects.test.ts` (um por efeito), `rules/cards.test.ts`,
    `e2e/cards.spec.ts` (galeria, duas rodadas pela interface, partida inteira com
    cartas até o fim, capturas `screenshots/phase4-*`).
- Partida jogável (Fase 3):
  - Jogar: `npm run dev` → Home → "Nova partida", ou direto `/?view=game&players=3&seed=1`
    (`long=1` aresta 5; para capturas/testes: `speed=0.5|1|2|instant`, `privacy=0|1`,
    `quality`, `post`, `adaptive`). Hotseat, todos humanos, só a camada de Economia.
  - Fluxo: `ui/game/session.ts` (Zustand) é a partida: `dispatch(action)` → `checkAction` →
    `applyAction` → lote {antes, depois, eventos} para o diretor (`anim/director.ts`). O diretor
    toca as pistas (`anim/cues.ts`, puro e testado) com GSAP e só no fim troca o estado
    MOSTRADO (`anim/presentation.ts`: `shown`, contadores do HUD, fase/turno, `viewer`, `busy`,
    `gate`, registro). Cena e HUD desenham o mostrado; regras sempre pela sessão/motor.
  - Animação 3D: `render3d/fxStore.ts` (itens com `p` animado pelo GSAP) + `components/Fx.tsx`
    (tile que vira, varredura, estrutura que sobe/desce, faíscas, anel+coluna de nível, tokens
    em arco, cofre da banca, Mina parada). Peça animada sai do lote via `hiddenHexes`/
    `hiddenStructures`. Sombras redesenham a cada quadro só enquanto há efeito.
  - Privacidade em hotseat: o diretor espera a tela "Vez de {facção}" sempre que muda quem
    decide — no início do turno ANTES da produção (o jogador vê a própria cascata) e em cada
    perna de uma troca. `viewer` = quem está diante da tela; o subsolo sondado (D10) só aparece
    para ele (marcador na ponta do hex, inspetor e registro).
  - Interpretações provisórias aprovadas na Fase 3 (isoladas e configuráveis):
    O) contraproposta: o destinatário troca a proposta pendente por outra no sentido inverso
       (`counterTrade`); quem propôs responde; sem limite de idas e vindas;
    P) desfazer (Ctrl+Z, `engine/undo.ts`): só a última ação do ativo nas Ações, se for
       Construir/Melhorar/Banca; refaz a partida pelo log sem ela; liga/desliga em ajustes;
    Q) tela de privacidade liga/desliga (padrão ligada) em ajustes e na nova partida;
    R) identidade do jogador = facção do assento (nome/cor/símbolo), "Jogador N" de subtítulo.
  - Atalhos (UX_SPEC 5): **Sondar é R** (S já move a câmera com WASD — decisão do usuário).
    Enter encerra a fase mesmo com botão do HUD em foco (dentro de diálogo, confirma o botão).
    Y avisa que Tratados estão desligados; Esc fecha um nível por vez e abre a pausa mínima;
    F1 = regras rápidas (números vêm do balance.json); Tab = registro.
  - Destaque de alvos: `actionTargets(ctx, state, player, molde)` em legal.ts; cor por ação em
    `tokens → scene.action` (provisória). Cores novas de interface em `palette.ui` (provisórias).
  - Tela de fim simples (vencedor, condição, classificação por progresso somado, revanche).
    O botão "Entregar e encerrar turno" só aparece com a camada de cartas.
  - Gancho de teste só em desenvolvimento: `window.__p3077` (`hexToScreen`, `targets`, `busy`,
    `legal`, `state`) — o Playwright clica no canvas de verdade. `e2e/game.spec.ts`: 2 rodadas
    de 3 jogadores pela interface (privacidade, banca, troca, desfazer), partida inteira até o
    fim, capturas 1920×1080 e 1366×768 (`screenshots/phase3-*`), animações a 0.5× e 1×.
  - Desempenho: tela de partida com 6 jogadores 59,6 FPS de média (p95 16,8 ms); a mesa da
    Fase 2 segue em 58 de média medida sozinha (em paralelo com outros testes cai para ~50).
  - Fora da fase: mão de cartas e slots preenchidos (Fase 4), IA (5), evento da rodada no topo e
    compensação de setup (6, hexes especiais desligados), tropas/tarifa (7), tratados (8),
    fim completo (9), setup completo/salvar/áudio/configurações (10), som em geral.
  - O Playwright reaproveita um `npm run dev -- --strictPort` já aberto; se a página vier com
    "504 Outdated Optimize Dep" (dependência nova), reinicie esse servidor.
- Mesa 3D (Fase 2):
  - Ver: `npm run dev` → `/?view=table&players=6&seed=1`. Parâmetros: `cam=overview|board:N|
    hex:B:q,r`, `quality=low|medium|high`, `ui=0` (sem painel), `post=0`, `adaptive=0`.
    Os parâmetros gravam nas configurações (localStorage `p3077.settings`).
  - Entrada única do render: `sceneModel(ctx, state, viewer)` (render3d/model.ts; a partida usa
    `sceneHexes` + `scenePlayers` com os contadores animados) → `<TableScene planet model />`.
    Saída para a UI: `useSceneStore` (hover, seleção, alvos, `requestFocus`) e
    `onHexSelect(listener)`. O render não lê regras.
  - Tropas, permanentes e facções ainda não existem no motor: o modelo já tem os campos, e só
    a vitrine (`render3d/dev/showcase.ts`, rota `?view=table`) os preenche, com **decoração só
    visual**. A vitrine ficou como rota de desenvolvimento (capturas de arte e teste de FPS); a
    partida de verdade não tem decoração. Cor do jogador provisória: assento N → facção N.
  - Tudo procedural, sem arquivos de arte: topos pintados em Canvas por terreno
    (`textures/terrain.ts`), névoa metálica com "?" virada para o dono, madeira, faces
    substitutas de carta; 11 estruturas low-poly por composição (`geometry/structures.ts`,
    Vila = peça herói), tropas, tokens nas formas de ART_DIRECTION 2.4, micro-geometria
    (árvores, picos, rochas, colunas, Vulcão, cristal). Cores novas da cena estão em
    `tokens.ts → scene` (**provisórias**: o ART_DIRECTION não fixa terreno/madeira/luz).
  - Desempenho: peças e bandejas instanciadas por (tipo, papel de material), cor da facção
    por instância (~250 draw calls com 6 jogadores); sombras só redesenham quando o modelo
    muda (`StaticShadows`). **Isso significa que animar uma peça na Fase 3 exige tirá-la do
    lote** (ou atualizar a matriz da instância).
  - Qualidade adaptativa (`render3d/adaptive.ts`, configurável): abaixo de 57 FPS sobe um
    degrau — sem tilt-shift → FXAA no lugar do SMAA → sem bloom → resolução 0,85/0,7.
    Medido no notebook de referência (Intel Iris Xe, 1920×1080, 6 jogadores, aresta 4):
    sem pós = 60 estável; pós completo ≈ 47; adaptativo assenta no degrau 3 ≈ 57–58,5 de
    média com p95 de 16,8 ms (95% dos quadros a 60). GPU melhor mantém tudo ligado.
  - Profundidade de campo = tilt-shift barato (bordas desfocadas). Caneca e caixa do jogo
    desligáveis. Trilhas de vitória na bandeja são só o espaço gravado (Fase 9).
  - Fora da fase: revelação do subsolo animada, partículas, `CardMesh` real (Fase 4),
    remapeamento de teclas (Fase 10; o mapa já está em `settings`).
  - Playwright usa a GPU real via ANGLE (cai no SwiftShader sem GPU); capturas
    `screenshots/phase2-*.png` e teste de FPS em `e2e/table.spec.ts`.
- Motor (Fase 1):
  - API: `createContext(data, nJogadores)` → `createGame(ctx, { seed, layers })` →
    `applyAction(ctx, state, action) → { state, events }`; `legalActions` / `checkAction`
    (motivo = chave `engine.illegal.<key>` no i18n); `decider(state)` diz quem decide
    (destinatário de troca pendente, senão o ativo); `replay(ctx, opções, log)`.
  - Estado é JSON puro; o reducer trabalha numa cópia (`structuredClone`).
  - Camadas: só `economy` ligada por padrão. Com `specialHexes`, sítios e hazards
    entram no baralho e na compensação, mas são **inertes** até a Fase 6.
  - Fases 1, 2, 6 e 7 do turno existem e não fazem nada; a Entrega só espera
    decisão com a camada `cards`.
  - Interpretações provisórias aprovadas (todas isoladas em funções pequenas):
    A) Mercado corta primeiro o lado da venda (`bank.spreadReductionOrder`);
    B) comércio entre quaisquer jogadores (`trade.requiresAdjacentBoard: false`);
    C) zona da Vila = distância ≤ `map.villageStartRing`, sem sítio/hazard;
    D) empate final = vitória compartilhada (`victory.finalTie`);
    E) Mina recém-construída produz no próximo turno; Manutenção paga o seguinte;
    F) Carvão insuficiente: Minas pagam em ordem de construção, as outras ficam ociosas;
    G) Mina produz multiplicador do nível × 1; cada produção gasta 1 token;
    H) Posto em Montanha usa max(raio do nível, 4);
    I) Melhorar exige Oficina (qualquer lugar), não exige raio; desconto da Oficina 3
       tira 1 unidade do recurso mais valioso do custo;
    J) uma estrutura de cada tipo por hex; estruturas sem `buildOn` vão em qualquer hex
       revelado; K) Sondar não exige hex revelado;
    L) vitória por estoque ≥ limiar no fim da rodada; progresso por trilha com teto 100%;
    M) expansão conta a Vila; N) ordem de turno fixa, assento 0 primeiro.
  - Garantias de setup trocam tiles entre tabuleiros (Comida: tile inteiro; Ouro: só
    o subsolo) e falham com erro se o baralho não permitir.
  - Partida aleatória (agente que sorteia tipo de ação) termina no limite de rodadas,
    sem Minas: elas exigem Universidade 2, que ação aleatória quase nunca alcança.
- Observações da Fase 0:
  - `data/layouts.json` (novo) guarda as rosetas 3–6 jogadores em coordenadas de uma
    grade hexagonal macro; `engine/hex.ts` converte para hexes globais. Proposta inicial
    (3 triângulo, 4 losango, 5 arco, 6 anel com centro vazio) — ajustável só nos dados.
  - `npm run data:check` emite **avisos** (não erros) para cartas fora da faixa de
    custo: são exatamente as 6 de DECISOES_ABERTAS D9. Pontos = recursos + descarte;
    custo em ações não conta (é o que bate com os números de D9).
  - `data:check` ainda não confere `effectId` contra o registro (entra na Fase 4).
  - Valores duplicados entre `balance.json` e `structures.json` (produção do Parque e
    da Pedreira, multiplicador e tokens da Mina) são checados por coerência.
  - `npm run art:check` responde "não implementado" (Fase 12); `npm run sim` chegou na Fase 5.
  - Capturas de tela do Playwright vão para `screenshots/` (fora do git).
