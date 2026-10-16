# PROJETO 3077 — Direção de Arte

> Referência visual: as cartas físicas da v0.3 (Logística Orbital, Bomba de Íons,
> Retirada Estratégica, Contrato de Tarifa Preferencial), os tiles hexagonais pintados
> e os tokens metálicos. **O jogo digital deve parecer a versão premium desse
> protótipo físico sobre uma mesa** — não um videogame genérico de ficção científica.

Cores abaixo foram extraídas visualmente da foto (aproximadas). Ajustar no
`src/ui/theme/tokens.ts` — nunca espalhar hex soltos pelo código.

---

## 1. Pilares visuais

1. **Industrial premium de mesa.** Metal escovado escuro, cantos chanfrados, rebites
   discretos, painéis creme com texto escuro. Parece objeto físico bem produzido.
2. **Ilustração pintada, semirrealista e saturada.** Luz quente, céu limpo, contraste
   alto. Tom aventureiro, não sombrio. Nunca grimdark.
3. **Cor codifica categoria, forma confirma.** Toda informação colorida tem um ícone ou
   forma redundante (acessibilidade para daltonismo).
4. **Legibilidade vence ornamento.** O texto de efeito é sempre lido em painel creme,
   nunca sobre ilustração.

---

## 2. Paleta

### 2.1 Base (moldura e interface)

| Token | Hex | Uso |
|---|---|---|
| `frame.900` | `#141A24` | Fundo da moldura, painéis escuros |
| `frame.800` | `#1E2633` | Moldura de carta, barras de HUD |
| `frame.700` | `#2B3545` | Bordas internas, separadores |
| `frame.edge` | `#8A94A3` | Filete metálico claro (bisel) |
| `accent.orange` | `#FF7A1A` | "3077", destaques, foco, botão primário |
| `paper.100` | `#F4EDDD` | Painel de texto das cartas |
| `paper.300` | `#E2D7BF` | Sombra do painel, tabelas |
| `ink.900` | `#1C1A17` | Texto sobre papel |
| `ink.600` | `#4A453D` | Texto secundário sobre papel |

### 2.2 Categorias de carta

| Categoria | Faixa / header | Fita do tipo | Ícone |
|---|---|---|---|
| Tecnologia | `#2F5D86` → `#1F3F5E` | `#24486B` | átomo |
| Carta entregue (sabotagem) | `#8E2B20` → `#5E1B14` | `#7A231A` | alvo / explosão |
| Carta própria | `#6B6A3A` → `#4A4A27` | `#5B5A31` | seta / insígnia |
| Contrato / Pacto | `#C99A2E` → `#8F6B1C` | `#B3862A` | aperto de mão |
| Relíquia | `#5B3F8C` → `#3B2860` | `#4C3476` | gema antiga |
| Evento | cor da categoria do evento | — | ver 2.3 |

### 2.3 Eventos (cartas horizontais)

| Categoria | Cor | Ícone |
|---|---|---|
| Sísmico | `#8C6A4A` | rachadura |
| Térmico | `#D2491E` | chama |
| Climático | `#3E8E5A` | gota / folha |
| Atmosférico | `#4F8FC0` | redemoinho |
| Horda | `#7A1F3D` | garra |
| Econômico | `#C99A2E` | moeda |

### 2.4 Recursos (cor + forma do token)

| Recurso | Cor | Forma do token 3D | Ícone |
|---|---|---|---|
| Comida | `#7FB34A` | disco | ramo |
| Pedregulho | `#A8A49A` | cubo arredondado | pedra |
| Ferro | `#7FA6C9` | prisma hexagonal | lingote |
| Carvão | `#3D3B38` | losango | pedra facetada |
| Petróleo | `#5A4A8A` | gota alongada | barril |
| Ouro | `#E8B64A` | octógono | moeda |

### 2.5 Facções (cor + símbolo)

| Facção | Cor | Símbolo |
|---|---|---|
| Revolucionários | `#D64541` | círculo |
| Governo Intergaláctico | `#3A7BD5` | quadrado |
| Consórcio Helix (Corp. A) | `#E89A2C` | triângulo |
| Vantage Dynamics (Corp. B) | `#7E6BD6` | losango |
| Piratas da Fenda | `#6E6C66` | hexágono |
| Nativos de Aurum | `#22A07A` | pentágono |

Nomes das corporações são **sugestões** — confirmar antes de produzir arte.

---

## 3. Tipografia
Fontes livres (Google Fonts), carregadas localmente no build.

| Uso | Fonte | Peso | Caixa |
|---|---|---|---|
| Títulos de carta, botões, cabeçalhos | **Barlow Condensed** | 700 | MAIÚSCULAS |
| Números grandes (força, contadores) | **Rajdhani** | 700 | — |
| Texto de efeito, interface | **Barlow** | 500 / 700 | sentença |
| Lore, diálogos | **Barlow** itálico | 400 | sentença |

Palavras-chave de regra no texto de efeito em **negrito maiúsculo** (DRONES,
ENERGIA → CARVÃO, TERRITÓRIO), como nas cartas físicas.

---

## 4. Anatomia da carta (retrato, proporção 63 × 88 mm)

```
┌────────────────────────────────┐  moldura frame.800, cantos chanfrados 6%
│ [ícone] NOME DA CARTA           │  header na cor da categoria, Barlow Cond 700
│ ┌──┐                            │
│ │n1│   ILUSTRAÇÃO               │  selo de nível no canto sup. esquerdo
│ └──┘   (área 3:2, ~52% altura)  │  ilustração sangra até a moldura lateral
│                                 │
│      ╱ FITA DO TIPO ╲           │  fita trapezoidal: TECNOLOGIA / CARTA ENTREGUE...
│ ┌─────────────────────────────┐ │
│ │ [ícone] custo               │ │  painel paper.100, linha de custo com ícones
│ │ Texto de efeito, 3–5 linhas │ │  Barlow 500, palavras-chave em negrito
│ └─────────────────────────────┘ │
│                          v0.3 ◢ │  etiqueta de versão no canto inferior direito
└────────────────────────────────┘
```

Moldura externa extra (só no 3D e no zoom): placa metálica "PROJETO **3077**" no topo,
como no suporte da foto — usada em telas de inspeção e na vitrine do Codex.

**Implementação:** um único componente de carta em **SVG** gera a face. O mesmo SVG
alimenta a interface 2D (mão, zoom) e é rasterizado para textura no 3D. Uma fonte de
verdade, zero divergência visual.

### Variações
- **Verso:** frame.900 com padrão de grade hexagonal sutil e o logo "3077" em laranja.
  Verso diferente por baralho: n1 (1 barra), n2 (2 barras), n3 (3 barras), Tesouro
  (dourado), Evento (horizontal).
- **Evento:** horizontal 88 × 63 mm, header na cor da categoria, ilustração panorâmica.
- **Estado "bloqueada"** (sem recurso para jogar): dessaturada 60%, custo em vermelho.

---

## 5. Tiles hexagonais (3D)

- Prisma hexagonal com **bisel** no topo e base grossa escura (parece papelão
  espesso de 3 mm laminado).
- **Topo pintado**, mesma linguagem das ilustrações das cartas, visto de cima com leve
  relevo (montanhas e árvores podem ter micro-geometria para paralaxe).
- Lateral: frame.800 com filete frame.edge.
- **Subsolo:** ao sondar, o tile levanta e inclina revelando uma "fatia" de corte
  geológico com o ícone do recurso subterrâneo — nunca esconder a superfície.
- **Névoa:** tile não revelado = verso metálico escuro com grade e um "?" gravado.
- Hazards únicos têm **moldura dourada fina** no bisel — destaque físico de raridade.

### Estruturas
Miniaturas low-poly estilizadas sobre o tile, com a cor da facção em faixas/bandeiras.
Nível indicado por **anéis na base** (1, 2 ou 3), não por modelo diferente.
O Centro da Vila é a única peça "herói" com modelo mais detalhado.

### Tropas
Miniaturas de peão estilizado: **Linha** = figura com escudo; **Artilharia** = canhão
sobre esteira. Cor da facção no corpo, símbolo da facção no topo. Nível = estrelas
flutuantes discretas (1–3).

### Tokens
Moedas metálicas com ícone em relevo, como na foto (ouro dourado, ferro prateado...).
Na interface, ícones vetoriais equivalentes.

---

## 6. Mesa e ambiente

- Mesa de **madeira** quente, levemente desfocada nas bordas (profundidade de campo).
- Iluminação: luz principal quente vinda de cima-esquerda, preenchimento frio suave,
  sombras suaves. Clima de "noite de board game".
- Fundo: penumbra; ao redor da mesa, objetos discretos (caneca, caixa do jogo) —
  opcional, desligável em qualidade baixa.
- Cada jogador tem uma **bandeja** à sua frente: slots de permanentes, trilhas de
  vitória, estoque de recursos (pilhas físicas de tokens que crescem).

---

## 7. Linguagem de animação

| Princípio | Regra |
|---|---|
| Física de mesa | Objetos se movem como peças reais: levantam, viajam em arco, assentam com leve quique |
| Duração | Ações do jogador 250–450 ms; cinemáticas (evento, revelação) 900–1600 ms |
| Easing | Saída rápida, chegada suave (`power3.out`); impacto com `back.out(1.4)` |
| Feedback | Toda ação tem som + movimento + mudança numérica no HUD |
| Lote | Produção de muitos hexes anima em cascata (atraso 40 ms entre hexes), nunca em fila longa |
| Velocidade | Configurável 0.5× / 1× / 2× / instantâneo |
| Movimento reduzido | Substitui translações por fade, remove tremor de câmera |

Lista completa por evento em `UX_SPEC.md`, seção 6.

---

## 8. Efeitos visuais

- Pós-processamento: bloom leve só em emissivos (laranja da interface, explosões),
  vinheta suave, antisserrilhado. Tudo desligável.
- Partículas: poeira ao assentar tile, faíscas na construção, anel de varredura ao
  sondar, cinzas no Vulcão, ondas de choque na Bomba de Íons.
- Destaque de alcance: hexes válidos recebem contorno animado na cor da categoria da
  ação; inválidos ficam levemente escurecidos.

---

## 9. Áudio

| Camada | Direção |
|---|---|
| Música | Orquestral-sintético calmo no menu; ambiente de exploração em jogo; tema tenso que entra por camadas quando há combate ou evento perigoso |
| Efeitos de mesa | Cartas deslizando, tokens metálicos tilintando, tile batendo na mesa |
| Efeitos de mundo | Maquinário, vento, rumor sísmico, explosão abafada |
| Interface | Cliques secos metálicos, confirmação com dois tons |

Sem arquivos de áudio no repositório inicial: efeitos procedurais via `jsfxr` como
substitutos, e um `audio-manifest.json` listando cada som esperado para troca futura.

---

## 10. Pipeline de produção de arte

O Claude Code **não gera pinturas raster**. Ele gera tudo que é vetorial, procedural ou
código. As ilustrações pintadas vêm de um gerador de imagem externo, escolhido por você.

| Asset | Quem produz | Formato |
|---|---|---|
| Molduras, fitas, selos, ícones, verso de carta | Claude Code (SVG) | `.svg` / componente |
| Interface, HUD, menus | Claude Code (React + CSS) | código |
| Tiles 3D (geometria, bisel) | Claude Code (procedural) | código |
| Estruturas e tropas | Claude Code (low-poly procedural) **ou** modelos GLB (glTF binário) externos | código / `.glb` |
| Ilustrações de cartas, tiles, facções, menu | **Você, com gerador de imagem** | `.webp` 1024 px |
| Efeitos sonoros | Claude Code (`jsfxr`) como substituto | código / `.ogg` |

**Fluxo:**
1. O Claude Code gera `public/art/art-manifest.json` com um prompt de imagem por asset.
2. Até a arte existir, o jogo usa **substitutos procedurais** no estilo (gradiente da
   categoria + ícone grande + textura de ruído) — o jogo nunca fica quebrado.
3. Você gera as imagens e salva com o `id` do asset em `public/art/`.
4. `npm run art:check` lista o que falta; `npm run art:optimize` converte e redimensiona.

### Prompt-base de ilustração (prefixo comum)
```
Painterly semi-realistic sci-fi concept art for a premium board game card,
vibrant saturated colors, warm sunlight, clean sky, high detail, adventurous
tone, centered subject with safe margins, 3:2 composition, no text, no frame,
no border, no logo, no watermark. Setting: a newly discovered Earth-like
planet in the year 3077, industrial frontier colonization.
Subject: {SUBJECT}
```

### Prompt-base de topo de tile
```
Top-down orthographic painted terrain texture for a hexagonal board game tile,
{TERRAIN}, painterly style matching sci-fi board game card art, soft top-left
lighting, seamless center, no text, no border, square 1024x1024.
```
