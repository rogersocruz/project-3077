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
npm run assets:build processa os ícones aprovados (assets-src → public/assets)
npm run assets:check confere ícones, créditos, sha256 e licenças
```

## Como trabalhar
- Comece cada fase em **modo de planejamento**: leia os documentos da fase, proponha o
  plano, espere aprovação.
- Ao terminar: rode testes, lint e `data:check`; para mudanças visuais, rode o
  Playwright, **tire capturas de tela e olhe para elas** antes de declarar pronto.
- Atualize a seção "Estado atual" abaixo e faça um commit por fase.
- Se uma regra do GDD parecer contraditória, **pare e pergunte** — não invente.

## Estado atual
- Fase concluída: 10 — Menus, configurações, save e áudio
- Próxima fase: 11 — Tutorial, diálogos e Codex
- Coleção (pedido do usuário; adianta o Codex da Fase 11): menu → Coleção ou `?view=collection`
  (`&tab=story|factions|resources|terrain|structures|cards|events|showcase`). Abas História
  (premissa do GDD 1 e falas do narrador da UX_SPEC 7), Facções (habilidade, lore, conselheiro),
  Recursos (valor, banca, limiar), Terrenos (superfícies, subsolo, sítios, hazards), Construções
  (níveis com custo/efeito e prévia 3D girando na cor da facção — `ui/collection/StructurePreview.tsx`),
  Cartas (componente do jogo, filtros por baralho/tipo, busca, zoom), Eventos e Vitrine 3D
  (`ui/collection/Showcase.tsx`). Busca em todas as abas. Teste: `e2e/collection.spec.ts`.
  Falta para o Codex da Fase 11: regras com busca e leitura por leitor de tela.
- Simulação ampliada (pedido do usuário, depois da Fase 10):
  - Condições de vitória selecionáveis: CLI `--wincons coal,gold,expansion` ou `--no-wincons
    food,stone` (também no `sim:balance`), Laboratório com caixas "Condições de vitória".
    Desligada = limiar inalcançável via `data/gameRules.ts → rulesOverride` (o mesmo do setup
    da partida) e fora do sorteio de rota da IA (`SimGameOptions.foci`); eliminação e limite de
    rodadas valem sempre. `run.ts → configOverride` junta isso ao --override/--balance.
  - Métricas detalhadas (`sim/metrics.ts` coleta, `sim/metricsReport.ts` agrega com IC):
    ritmo (rodada em que alguém passa de 50%/80%, trocas de líder, margem 1º−2º, viradas),
    curvas por rodada (estoque, renda, gasto, banca, exército, progresso; por recurso, facção
    e assento → `economy.csv`), ações e decisões por tipo, ações que sobraram, construção (por
    jogador, 1ª rodada, nível final), cartas por categoria, conflito (combates, vitória do
    atacante, ataques à Vila) e matrizes por assento (trocas, tratados, sabotagens). Saem no
    texto do CLI, em `metrics.json`/`economy.csv` e no painel "Métricas detalhadas" do Laboratório.
- Casca do jogo (Fase 10):
  - Telas: splash (`ui/screens/Splash.tsx`, 3 s, pulável, 1×/sessão; o Playwright pula —
    `?splash=1` força), menu (`Home.tsx`: mesa 3D da vitrine em órbita ao fundo —
    `MenuBackdrop.tsx`; Continuar só com save automático; rodapé com versão e idioma), setup
    completo (`NewGame.tsx`: assentos Humano/IA/Fechado, facção com habilidade e lore, presets
    de camadas, condições de vitória, limite de rodadas, ações por turno, velocidade da IA,
    regra do eliminado, prévia 2D da roseta, duração estimada), carregamento
    (`ui/loading/LoadingScreen.tsx`, some com `data-scene-ready`), configurações
    (`?view=settings` e modal da pausa) e carregar (`?view=load`).
  - Regras da partida (decisão do usuário): `GameSetup.rules` → `rulesOverride` (params.ts) vira
    override do balance.json só daquela partida (URL `apt`, `rl`, `off`), gravado no save.
  - Configurações (`settings/index.ts`, UX_SPEC 3; tudo com efeito e teste): vídeo (tela
    cheia, escala de renderização, limite de FPS — `FpsLimiter`, predefinições Baixa→Ultra,
    detecção automática — `render3d/autoQuality.ts`, sombras, FXAA/SMAA/desligado, bloom,
    profundidade de campo, objetos, partículas, escala da interface, FPS; resolução/VSync só
    no app desktop), áudio (6 canais + silenciar sem foco), jogabilidade (velocidades,
    confirmar encerrar com ações sobrando, avançar fases automáticas — o diretor para com
    "Continuar", desfazer, dicas, previsão de combate, salvamento automático, idioma),
    controles (sensibilidades, inverter eixos, câmera pelas bordas, **atalhos remapeáveis** com
    aviso de conflito), acessibilidade (`ui/theme/accessibility.ts`: daltonismo com paleta
    Okabe–Ito validada + formas/símbolos, alto contraste, tamanho de texto, reduzir movimento
    que manda em `prefersReducedMotion`, tremor de câmera nos eventos sísmicos, legendas,
    tempo ilimitado nos avisos).
  - Save (`save/index.ts`, UX_SPEC 9): setup + log + checksum do estado; 10 espaços +
    automático (por turno/rodada) em localStorage; exportar/importar JSON; carregar refaz pelo
    log (`session.loadSave`) e avisa versão de regras diferente ou checksum divergente.
  - Áudio (`src/audio/`, decisões do usuário): sintetizador próprio no formato do sfxr
    (`sfxr.ts`, determinístico pelo RNG do projeto — sem o pacote jsfxr de licença ambígua),
    35 sons em `sounds.ts` (todo momento da UX_SPEC 6 + interface), Howler por canal, mapa
    pista→som no diretor (`map.ts`), trilha procedural em Web Audio (`music.ts`: menu,
    exploração, camada tensa em combate/evento perigoso), legendas (`CaptionBar`),
    `public/audio/audio-manifest.json` gerado por `npm run audio:manifest`.
  - Testes: `audio/audio.test.ts`, `save/save.test.ts`, `settings/settings.test.ts`,
    `e2e/shell.spec.ts` (salvar → nova página → carregar = estado idêntico; configurações com
    efeito; atalho remapeado na partida; pausa entre fases; volume no som; legendas; capturas
    `screenshots/phase10-*`).
  - Fora da fase: partículas de poeira no menu, "seed do dia" (backlog), app desktop
    (resolução, VSync, modo sem bordas — Fase 13), leitura de cartas por leitor de tela
    (Fase 11 com o Codex).
- Facções e encerramento (Fase 9):
  - Jogar: Nova partida (Facções ligado por padrão; facção por assento ou "Aleatória"; regra
    do eliminado) ou URL `factions=1&fac=pirates,random,…&elim=neutral`. Sem a camada, assento
    N = facção N só como visual. A cena e o HUD usam a facção do jogador
    (`render3d/model.ts → setSeatFactions`, chamado pela sessão).
  - Motor: `player.faction` (setup: escolhidas ficam, livres sorteadas sem repetir com RNG
    próprio derivado da seed — `setup.ts → assignFactions`; não mexe no RNG da partida);
    habilidades em `rules/factions.ts → ability()`, parâmetros em `factions.json →
    ability.params` (validados em `effects/world.ts`). Ganchos: Levante (`phases.startTurn`),
    Protocolo (`checkCardBasics` + compra extra em `continueTurn`), Eficiência
    (`economy.structureYield`), Aquisição (`bankPrices`), Saque (`discardNeed`), Raízes
    (`actionCost` + `spendFreeSurvey`). Evento `factionAbility`.
  - Alvo de tribo (decisão do usuário): alvos sorteados sem repetir e sem si mesmo (com o
    conflito; `drawTribeTargets`), público; vence quem deixou a Vila-alvo com 1 vida e deu o
    último dano (`player.lastHitBy`); alvo eliminado = trilha impossível. Trilha "Tribo" no
    HUD (ícone = facção-alvo).
  - Regra do eliminado (D11, `balance.victory.eliminatedRule`, opção no setup): `leave`
    (padrão) ou `neutral` = segue jogando pela IA (`player.neutral`; a sessão cria o agente),
    negocia, não vence.
  - Interpretações provisórias (isoladas em rules/factions.ts; **revisar com o usuário**):
    BG) Levante = menor progresso somado no início do turno, empatados ganham;
    BH) Protocolo vale para jogar, instalar e entregar (pontos de costPoints), carta extra n1
        depois da linha da Universidade; BI) Eficiência só na produção;
    BJ) Aquisição: venda da banca pelo valor, Mercado ainda reduz; BK) Saque só em valência
        sabotagem; BL) Raízes: 1º Sondar do turno grátis (o grátis da Crosta não consome).
  - Fim de partida (`ui/end/`): placa VITÓRIA — condição, órbita lenta no tabuleiro vencedor
    (`sceneStore.setOrbit`), abas Classificação · Gráficos (estoque em pontos, força militar,
    cartas jogadas, progresso — `LineChart`) · Linha do tempo · Exportar JSON. O histórico refaz
    a partida pelo log (`history.ts → gameHistory`).
  - Simulador/Laboratório: facções sorteadas por partida, "Vitórias por facção" com IC de
    Wilson (relatório e gráfico do Laboratório); trilha `tribe` nas vitórias.
  - **Critério de aceite NÃO cumprido (reportado, nada corrigido):** em 500 partidas de 4
    jogadores, Consórcio Helix (Eficiência) vence 53,6% [48,2–58,9]; as outras 16–22%.
    Detalhes e sugestões em `docs/SIMULACAO.md`.
  - Testes: `rules/factions.test.ts` (montagem, uma por habilidade, tribo, neutra),
    `ui/end/history.test.ts`, `e2e/factions.spec.ts` (capturas `screenshots/phase9-*`).
- Tratados (Fase 8):
  - Jogar: Nova partida (Tratados ligado por padrão) ou URL `treaties=1`. Botão "Tratado" / tecla
    Y abre o construtor (`ui/treaty/TreatyModal.tsx`): parceiro, modelos prontos, Contrato
    (quem dispara → o que faz → contra o quê → de quem → quem cumpre → consequência → detalhes)
    ou Pacto (categoria → pacto), revisão em linguagem natural (`ui/treaty/describe.ts`), custo em
    Ouro em destaque. Aba "Tratados ativos": romper pacto e oferta dos pactos de comércio.
    Resposta do destinatário com tela de privacidade (`TreatyReply`); faixa dourada no painel
    do jogador (`TreatyBand`); selo do diretor na assinatura/disparo/quebra (cue `treaty`).
  - Validade = regra fixa do motor (decisão do usuário): `rules/treaties.ts → checkTreatyTerms`
    (rascunho parcial para o construtor, `ui/treaty/builder.ts` só oferece o que passa).
    Vocabulário de papéis em `treaties.json → contract.subjects/victims/obligors` e
    `pactConflicts` (novos; o modelo Tarifa Preferencial usa `actor` no lugar de `invader`).
  - Motor: estado `treaties {active, restrictions, pending, nextId}`, `player.treatyRound`,
    `player.actionDebt`; ações `proposeTreaty/acceptTreaty/rejectTreaty/cancelTreaty/
    breakTreaty/useTreaty`; gatilhos lidos dos eventos no fim de cada ação
    (`observeTreaties`); prazos no FIM da rodada (`endRoundTreaties`); pedágio, Base Avançada,
    Canal Aberto e Céu Aberto em `rules/treatyQueries.ts` (lidos por troops/combat/cards/build).
    Tratados Livres virou passivo real (`effects/treaties.ts`; `effects/gated.ts` saiu).
  - Decisões do usuário: ação proibida por pacto ROMPE (com aviso e confirmação) + botão
    Romper; contrato sem disparo expira em 5 rodadas e a troca de pedágio vale em toda entrada;
    pactos de comércio = oferta permanente.
  - Interpretações provisórias (isoladas em rules/treaties.ts; **revisar com o usuário**):
    BA) só o ativo propõe, nas Ações, 1 proposta por turno, tratado bilateral, resposta na hora;
    BB) pacto: ação proibida rompe; NÃO PODE de contrato = proibição real (o motor recusa);
    BC) "N rodadas" contam a atual; "SE NÃO" vence no fim da rodada seguinte; PAGA EM VEZ DA
        TARIFA contínua; as outras consequências disparam uma vez e encerram;
    BD) papéis me/you = quem propôs/recebeu; otherSignatory (vítima) = o signatário que não agiu;
        (obrigado) = parceiro da vítima; beneficiário = sempre o outro signatário;
    BE) gatilho pelos eventos (autor = jogador da ação, remetente da carta revelada ou
        atacante); ATACAR também ao mover para hex com tropa/Vila da vítima; DESTRUIR inclui
        rebaixar; carta paga/entregue/descartada é sorteada; inadimplência = paga o que puder e
        perde 1 ação (no próprio turno sai na hora; senão vira dívida no próximo turno);
    BF) Livre Comércio pelo valor base (arredonda a favor de quem cede), Preço Fixo = recurso ⇄
        Ouro pelo preço, 1 vez por turno, sem aceite.
  - IA (`ai/treaties.ts`): aceita se o valor estimado passa o Ouro + margem (paz ∝ força do
    outro; pedágio ∝ tropas; contrato ∝ chance × valor); propõe só modelos prontos que valem
    para os dois e com Ouro dos dois. Pesos `treaty*` em `weights.ts`.
  - Testes: `rules/treaties.test.ts` (validação, aceite/Ouro/limite, cada gatilho, cada
    consequência, inadimplência, SE NÃO, expiração, pactos, Tarifa Preferencial como critério de
    aceite, replay), `ai/agent.test.ts` (aceita/recusa), `e2e/treaty.spec.ts` (capturas
    `screenshots/phase8-*`).
  - Fora da fase: contraproposta de tratado, tratados com cartas na proposta (só nas
    consequências), faixa dourada em 3D na bandeja (hoje no painel HUD do jogador).
- Tropas e combate (Fase 7):
  - Jogar: Nova partida (Conflito ligado por padrão) ou URL `conflict=1`. Recrutar/subir tropa
    e "Mover tropas daqui" no inspetor do hex; mover para hex com inimigo abre a previsão
    (`ui/combat/CombatModals.tsx`); o combate resolve na fase 6 do turno com painel e, se o
    perdedor for humano, escolha de baixas (`chooseCasualties`). Tarifa na barra inferior.
  - Motor: `rules/troops.ts` (força, teto, recrutar, subir, tarifa, `planMove` Dijkstra com
    pedágio) e `rules/combat.ts` (`previewCombat`, `resolveCombat`, recuo, `runCombatPhase`,
    `villageAttacks`, `occupiedAgainst`); efeitos de tropa em `effects/troops.ts`.
    `state.combat` guarda a fila da fase; `pending` pode ser `tutor` ou `casualties`.
  - GDD 8.4.1 (novo): exemplo trabalhado 11×10 + empate + três lados = teste de aceite
    (`rules/combat.test.ts`).
  - Decisões do usuário: o usuário escreve/valida o exemplo; recrutar = 1 ação + custo;
    hex ocupado: o dono para de produzir e o ocupante extrai (`occupiedHexYield`);
    Desastre atinge as tropas no hex.
  - Interpretações provisórias (isoladas): AR) tarifa inicial `border.defaultTariff`, muda
    1×/rodada; AS) teto = maior Quartel × 3; AT) limite de 3 espaços = estruturas + tropas de
    UM jogador (coerente com 8.4.1); AU) caminho mais barato em Comida por hexes revelados,
    não atravessa inimigo, pedágio por entrada em território alheio; AV) atacante = ativo,
    senão quem chegou por último; AW) apoio até 3 por lado, 1 combate/turno; AX) baixa conta
    a força com que lutou, escolha só quando é real, empate: cada lado perde a mais fraca;
    AY) recuo para o mesmo vizinho seguro (próprio tabuleiro, perto da Vila), sem lugar a
    tropa é perdida; AZ) Guardião = lado neutro (−1), Horda = −2 e só ataca no evento.
  - Simulação (`simulations/phase7`, docs/SIMULACAO.md): eliminação 0%, 0,23 combates por
    partida — a IA quase não ataca (agressão fica para a Fase 9).
  - e2e `e2e/conflict.spec.ts` (capturas `screenshots/phase7-*`). Cor `scene.action.move`
    provisória.
- O planeta reage (Fase 6):
  - Jogar: Nova partida (Eventos e Hexes especiais ligados por padrão) ou URL
    `events=1&special=1` (na URL ficam desligados por padrão, para não mudar as partidas dos
    testes antigos). Simulador/Laboratório: camada `events`.
  - Motor: `rules/world.ts` (baralho de eventos, revelação no início da rodada, gatilho dos
    hazards, fim de rodada, Escavar, Tesouro, contra-ação `brace`, limpar `cleanHex`),
    `rules/hazards.ts` (desastre GDD 4.4, vidas da Vila, eliminação, defesa contra horda),
    `rules/specials.ts` (bônus passivos dos hazards), `effects/world.ts` (registro dos 15
    eventos + 7 bônus + 7 danos, parâmetros validados na carga), `effects/world-cards.ts`
    (Guardião Desperto, Blindagem Sísmica). Estado: `world`, `hex.status`, `hex.guardian`,
    `hex.excavatedBy`, `player.eliminated`, `cards.treasure`. O reducer desconta ações por
    `actionCost` (mesma conta do legal.ts). Parque pode ir em Vulcão e Pântano (structures.json).
  - Decisões do usuário (Fase 6): baralho de 12 que rebaralha; bônus do hazard para quem tem
    estrutura nele; Horda/Guardião viram desastre/bloqueio até a Fase 7; Vila a 0 vidas elimina.
  - Interpretações provisórias da Fase 6 (isoladas; **revisar com o usuário**):
    AJ) baralho ativo = cópias embaralhadas com no máx. `maxPerCategoryInActiveDeck` por
       categoria até `activeDeckSize` (dá 12); acabou, os usados voltam embaralhados;
    AK) Horda: sai da Ruína de menor r global e ataca o vizinho com mais estruturas — desastre
       só nesse hex, salvo defesa (Muro + Postos adjacentes) ≥ força; Guardião fica parado,
       bloqueia escavar e construir; Ventos de Cauda fora do baralho até a Fase 7;
    AL) bônus do hazard: Parque em Vulcão = 2 Carvão + (nível−1); Pântano = 2× Comida do
       nível; Geiser: Minas a ≤1 de qualquer dono sem Carvão; Cânion: Drones grátis de quem
       tem estrutura nele; Crosta Fina: sondar o hex é grátis para qualquer um, Mina −1
       Pedregulho e ×+1; Porto Franco: spread 0 (fechado: spread ×2) para quem tem estrutura;
       Anomalia: Sabotagem não alveja hex e vizinhos (invertida: efeito aplicado 2×);
    AM) Blindagem Sísmica: desastre só rebaixa as estruturas do dono;
    AN) Ruína: escavada uma vez; o bônus (+1 n1 em toda linha e linha n3) é de quem escavou;
    AO) Tesouro "instant" vai para a mão e se joga como carta própria; Guardião resolve na
       hora no hex escavado; a IA avalia Escavar pelo valor esperado (não espia o topo);
    AP) todo hazard da categoria do evento sofre o próprio dano (idempotente), antes do efeito;
    AQ) contra-ação nas Ações devolve o que o evento tirou na Produção do turno (Minas
       produzem e pagam Carvão; o corte da Chuva Ácida volta) — o evento é revelado antes da
       Produção, mas o jogador só decide depois;
    Eventos "nesta rodada" valem para todos os turnos da rodada; "N rodadas" contam a atual.
  - Interface: cinemática do evento (`ui/event/EventReveal.tsx`, CSS por categoria, fade com
    movimento reduzido), carta horizontal em DOM (`EventCard.tsx`), chip no topo com zoom,
    pulso nos hexes atingidos (`sceneStore.pulse`), botão "Proteger-se" na barra, inspetor com
    estados/Guardião/Ruína e botões Escavar/Limpar, escolha de compensação de setup
    (`CompensationChoice`), marcas 3D de estado e Guardião (`CardMarkers.tsx`).
  - IA: Escavar por valor esperado, contra-ação (inclui a perda da Praga), risco de hazard
    (`hazardRisk`) na renda de Montanha e vizinhança de hazards sísmicos/térmicos.
  - Simulação (D15): cada hazard é atingido em 85–94% das partidas; Cofre Precursor leva o
    Ouro a 32% das vitórias (partidas de 2–4 rodadas). Detalhes e sugestões em
    `docs/SIMULACAO.md` (balance.json intocado).
  - Testes: `rules/world.test.ts` (um por effectId de events/tiles, baralho, desastre,
    eliminação, sítios, Tesouro, AQ, partida aleatória com tudo ligado), `e2e/world.spec.ts`
    (cinemática, chip/zoom, contra-ação, Escavar pelo inspetor, Tremor a 0,5×, partida só de
    IA com todas as camadas até o fim; capturas `screenshots/phase6-*`).
- Assets de terceiros (Fase 2B, parcial — decisão do usuário: **só ícones de recursos e
  de categorias de carta**; interface Tabler e modelos 3D Kenney ficaram de fora):
  - 13 ícones game-icons.net (CC BY 3.0; Lorc, Delapouite, Skoll, Sbed), coluna A de
    `docs/ASSET_SHORTLIST.md`, baixados do repositório oficial (commit fixado) para
    `assets-src/_inbox/game-icons/`. Aprovados = `assets-src/icons.manifest.json`.
  - `npm run assets:build` (idempotente, sem dependência nova): tira o fundo, currentColor,
    viewBox 24 → `public/assets/icons/<id>.svg`, `assets/credits.json` (sha256 final e
    original), `assets/icon-map.json` e `src/ui/icons/gameIcons.generated.ts` (paths para o
    SVG da carta, que vira textura 3D; fora do Prettier). Formato inesperado falha.
  - `npm run assets:check`: ícone para cada recurso e as 7 categorias; todo arquivo em
    public/assets com crédito; sha256 confere; licença na lista aceita.
  - Integração: `IconSilhouette` em `ui/card/glyphs.tsx` (creme chapado + contorno escuro);
    `ResourceGlyph` = forma do token na cor do recurso + silhueta (cartas, ilustrações, HUD
    via `ResourceIcon`, que agora desenha o mesmo SVG); `CategoryIcon` no header da carta
    (Tesouro usa `card-treasure`; `card-event` espera a Fase 6). HUD de recursos em 24 px.
    Em ≤16 px (linha de custo) lê-se a forma/cor do token; o desenho é detalhe.
  - Tela Créditos (Home → Créditos) gerada de credits.json, por autor, no formato do
    game-icons; `assets/LICENSES.md`.
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
