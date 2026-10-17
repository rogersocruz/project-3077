# PROJETO 3077 — Shortlist de assets de terceiros (Fase 2B, Etapa 1)

> **Aprovado (2026-10-17): só os ícones A de Recursos (seção 1) e Categorias de carta
> (seção 2)** — 13 ícones, baixados e integrados. Interface (seção 7) e modelos 3D (seção
> 8) ficaram de fora por decisão do usuário. Texto original da proposta abaixo.
>
> Proposta para aprovação. Os nomes foram conferidos contra a lista
> oficial de cada coleção, e as licenças contra o registro npm e as páginas oficiais
> (consulta de 2026-10-17). Em cada linha, **A** é o recomendado e **B** a alternativa.

## Fontes e licenças verificadas

| Fonte | Como entra (Etapa 2) | Licença | Onde foi confirmada | Crédito |
|---|---|---|---|---|
| **game-icons.net** | npm `@iconify-json/game-icons` 1.2.4 (SVGs) + autor de cada ícone pela pasta no repositório oficial `github.com/game-icons/icons` | **CC BY 3.0** | `npm view` (`CC-BY-3.0`) e `license.txt` do repositório oficial | **Sim**, por autor: "Icons made by {autor}. Available on https://game-icons.net" |
| **Tabler Icons** | npm `@tabler/icons` 3.49.0 | MIT | `npm view` (`MIT`) | Aviso de copyright no LICENSES.md (sem crédito na tela) |
| **Lucide** (só alternativa de interface) | npm `lucide-static` / `@iconify-json/lucide` | ISC | `npm view` (`ISC`) | Aviso no LICENSES.md |
| **Kenney** (modelos 3D) | zip oficial de `kenney.nl/assets/<pacote>` | **CC0** | página oficial de cada pacote ("Creative Commons CC0") | Não exigido (cortesia: "Kenney.nl") |

Observações:
- O pacote npm do game-icons traz a licença do conjunto, mas **não o autor de cada ícone**.
  O crédito por autor vem do repositório oficial, que separa os SVGs em pastas por autor
  (lorc, delapouite, skoll…). A Etapa 2 grava o autor certo em `credits.json`.
- Duas pastas do repositório repetem ícones: `badges` (cópias) e `viscious-speed`
  (CC0). Nenhum recomendado vem delas; o autor usado é sempre a pasta original.
- O ícone `rock` existe em duas pastas (`lorc` e `john-redman`): usar a de `lorc`.

---

## 1. Recursos (resources.json — 6)
ART_DIRECTION 2.4 pede o ícone: ramo, pedra, lingote, pedra facetada, barril, moeda.

| id | A (recomendado) | B | Fonte · licença · autor A |
|---|---|---|---|
| `resource-food` | `wheat` | `grain-bundle` | game-icons · CC BY 3.0 · Lorc |
| `resource-stone` | `stone-pile` | `rock` | game-icons · CC BY 3.0 · Delapouite |
| `resource-iron` | `metal-bar` | `anvil` | game-icons · CC BY 3.0 · Lorc |
| `resource-coal` | `coal-pile` | `coal-wagon` | game-icons · CC BY 3.0 · Delapouite |
| `resource-oil` | `barrel` | `oil-drum` | game-icons · CC BY 3.0 · Delapouite |
| `resource-gold` | `two-coins` | `gold-bar` | game-icons · CC BY 3.0 · Delapouite |

## 2. Categorias de carta (7)
| id | A | B | Fonte · autor A |
|---|---|---|---|
| `card-tech` (Tecnologia, átomo) | `atom` | `circuitry` | game-icons · Skoll |
| `card-delivered` (Carta entregue, alvo) | `targeted` | `letter-bomb` | game-icons · Sbed |
| `card-own` (Carta própria, seta/insígnia) | `flag-objective` | `upgrade` | game-icons · Delapouite |
| `card-contract` (Contrato/Pacto, aperto de mão) | `shaking-hands` | `contract` | game-icons · Delapouite |
| `card-relic` (Relíquia, gema antiga) | `gem-pendant` | `emerald` | game-icons · Lorc |
| `card-event` (Evento) | `lightning-helix` | `hourglass` | game-icons · Lorc |
| `card-treasure` (Tesouro) | `open-treasure-chest` | `locked-chest` | game-icons · Skoll |

## 3. Estruturas (structures.json — 11)
| id | A | B | Fonte · autor A |
|---|---|---|---|
| `structure-village` | `village` | `house` | game-icons · Delapouite |
| `structure-park` (Parque de Extração) | `forklift` | `factory` | game-icons · Delapouite |
| `structure-quarry` | `stone-crafting` | `hammer-drop` | game-icons · Lorc |
| `structure-mine` | `mining` | `gold-mine` | game-icons · Lorc |
| `structure-workshop` | `auto-repair` | `spanner` | game-icons · Lorc |
| `structure-outpost` | `radar-dish` | `watchtower` | game-icons · Lorc |
| `structure-wall` | `stone-wall` | `brick-wall` | game-icons · Delapouite |
| `structure-barracks` | `barracks` | `barracks-tent` | game-icons · Delapouite |
| `structure-university` | `graduate-cap` | `telescope` | game-icons · Delapouite |
| `structure-archive` | `bookshelf` | `scroll-unfurled` | game-icons · Delapouite |
| `structure-market` | `shop` | `trade` | game-icons · Delapouite |

## 4. Ações do turno (11)
| id | A | B | Fonte · autor A |
|---|---|---|---|
| `action-explore` | `compass` | `spyglass` | game-icons · Lorc |
| `action-survey` (Sondar) | `radar-sweep` | `magnifying-glass` | game-icons · Lorc |
| `action-build` | `hammer-nails` | `trowel` | game-icons · Lorc |
| `action-upgrade` | `upgrade` | `hammer-drop` | game-icons · Delapouite |
| `action-excavate` | `spade` | `dig-hole` | game-icons · Lorc |
| `action-recruit` | `knight-banner` | `person` | game-icons · Delapouite |
| `action-move` | `footsteps` | `walk` | game-icons · Skoll |
| `action-trade` (comércio entre jogadores) | `swap-bag` | `trade` | game-icons · Lorc |
| `action-bank` | `bank` | `piggy-bank` | game-icons · Delapouite |
| `action-treaty` | `scroll-quill` | `contract` | game-icons · Delapouite |
| `action-deliver` | `delivery-drone` | `envelope` | game-icons · Delapouite |

## 5. Eventos, hazards e sítios (tiles.json / events.json — 15)
| id | A | B | Fonte · autor A |
|---|---|---|---|
| `event-seismic` (rachadura) | `earth-crack` | `cracked-glass` | game-icons · Lorc |
| `event-thermal` (chama) | `flame` | `fire` | game-icons · Carl Olsen |
| `event-climatic` (gota/folha) | `droplets` | `falling-leaf` | game-icons · Lorc |
| `event-atmospheric` (redemoinho) | `whirlwind` | `tornado` | game-icons · Lorc |
| `event-horde` (garra) | `claw-slashes` | `monster-grasp` | game-icons · Lorc |
| `event-economic` (moeda) | `cash` | `coins` | game-icons · Lorc |
| `hazard-volcano` | `volcano` | `fire-bowl` | game-icons · Lorc |
| `hazard-geyser` | `steam-blast` | `steam` | game-icons · Delapouite |
| `hazard-acid_swamp` | `swamp` | `acid` | game-icons · Delapouite |
| `hazard-wind_canyon` | `wind-hole` | `wind-slap` | game-icons · Lorc |
| `hazard-thin_crust` | `hole` | `cracked-glass` | game-icons · Delapouite |
| `hazard-free_port` | `anchor` | `harbor-dock` | game-icons · Lorc |
| `hazard-magnetic_anomaly` | `magnet` | `magnet-blast` | game-icons · Lorc |
| `site-temple` | `greek-temple` | `egyptian-temple` | game-icons · Delapouite |
| `site-ruin` | `ancient-ruins` | `broken-wall` | game-icons · Delapouite |

`event-economic` usa `cash` (A) e não `coins`, que ficaria parecido demais com o Ouro (`two-coins`).

## 6. Tropas (balance.json → troops — 2)
| id | A | B | Fonte · autor A |
|---|---|---|---|
| `troop-line` (figura com escudo) | `checked-shield` | `spartan-helmet` | game-icons · Lorc |
| `troop-artillery` (canhão) | `cannon` | `field-gun` | game-icons · Lorc (B: Quoting) |

## 7. Interface (Tabler A · Lucide B — todos MIT/ISC)
Inclui os 11 glifos provisórios de hoje (`ui/components/Bits.tsx`) e os previstos no UX_SPEC.

| id | Tabler (A) | Lucide (B) |
|---|---|---|
| `ui-pause` | `player-pause` | `pause` |
| `ui-play` | `player-play` | `play` |
| `ui-speed` (2× / instantâneo) | `player-track-next` | `fast-forward` |
| `ui-settings` | `settings` | `settings` |
| `ui-save` | `device-floppy` | `save` |
| `ui-undo` | `arrow-back-up` | `undo-2` |
| `ui-redo` | `arrow-forward-up` | `redo-2` |
| `ui-zoom-in` | `zoom-in` | `zoom-in` |
| `ui-zoom-out` | `zoom-out` | `zoom-out` |
| `ui-close` | `x` | `x` |
| `ui-help` | `help` | `circle-help` |
| `ui-alert` | `alert-triangle` | `triangle-alert` |
| `ui-info` | `info-circle` | `info` |
| `ui-life` | `heart` | `heart` |
| `ui-life-lost` | `heart-broken` | `heart-crack` |
| `ui-log` | `list-details` | `scroll-text` |
| `ui-cards` | `cards` | `layers` |
| `ui-envelope` | `mail` | `mail` |
| `ui-menu` | `menu-2` | `menu` |
| `ui-volume` | `volume` | `volume-2` |
| `ui-mute` | `volume-off` | `volume-x` |
| `ui-privacy-show` | `eye` | `eye` |
| `ui-privacy-hide` | `eye-off` | `eye-off` |
| `ui-check` | `check` | `check` |
| `ui-prev` / `ui-next` | `chevron-left` / `chevron-right` | `chevron-left` / `chevron-right` |
| `ui-export` | `download` | `download` |
| `ui-import` | `upload` | `upload` |
| `ui-home` | `home` | `house` |
| `ui-exit` | `door-exit` | `log-out` |
| `ui-rematch` | `refresh` | `refresh-cw` |
| `ui-fullscreen` | `arrows-maximize` | `maximize` |
| `ui-keyboard` | `keyboard` | `keyboard` |
| `ui-language` | `language` | `languages` |
| `ui-discard` | `trash` | `trash-2` |
| `ui-rotate` (câmera) | `rotate-clockwise` | `rotate-cw` |
| `ui-focus` (centralizar câmera) | `focus-centered` | `crosshair` |
| `ui-click` (tutorial) | `hand-click` | `mouse-pointer-click` |

Emblemas de facção: **não entram** (formas geométricas em código, como hoje).

---

## 8. Modelos 3D provisórios (Kenney, CC0)
Pacotes confirmados na página oficial: Space Kit (150 assets), Space Station Kit (90),
City Kit Industrial (40), Tower Defense Kit (160), Castle Kit (75), Survival Kit (80),
Fantasy Town Kit (160), Mini Characters (25), Food Kit (200), Furniture Kit (140).
Proposta: no máximo **dois kits principais** (Space Kit + City Kit Industrial) para o
conjunto ficar coerente; os outros só preenchem buracos. As páginas não listam os nomes
dos arquivos, então o modelo exato de cada linha é escolhido na Etapa 2, pela lista do
pacote, e fica na prancha de revisão.

| id (structures.json) | A | B | Observação |
|---|---|---|---|
| `village` (peça herói) | Space Kit — base/hangar com antena | Space Station Kit — módulo central | ART_DIRECTION quer a Vila mais detalhada: pode combinar 2–3 peças |
| `park` | City Kit Industrial — esteira/máquina de extração | Space Kit — máquina/perfuratriz | |
| `quarry` | City Kit Industrial — guindaste/caçamba | Survival Kit — rochas + ferramentas | |
| `mine` | City Kit Industrial — torre com chaminé (castelete) | Space Kit — perfuratriz | |
| `workshop` | City Kit Industrial — galpão de fábrica | Space Kit — oficina/hangar pequeno | |
| `outpost` | Space Kit — torre com antena/parabólica | Tower Defense Kit — torre | |
| `wall` | Tower Defense Kit — segmento de muro | Castle Kit — muralha | |
| `barracks` | Space Kit — hangar | Survival Kit — barraca | |
| `university` | Space Station Kit — domo/observatório | Space Kit — domo | |
| `archive` | Space Station Kit — módulo de armazenamento | City Kit Industrial — tanque/silo | |
| `market` | Fantasy Town Kit — barraca de feira | Survival Kit — caixotes e lona | Fantasy Town destoa do tom sci-fi: preferir caixotes |
| `troop-line` | Mini Characters — figura (escudo do Castle Kit) | peão procedural atual | |
| `troop-artillery` | Tower Defense Kit — canhão | Space Kit — torre/veículo com canhão | |
| mesa: caneca | Food Kit — caneca | Furniture Kit — xícara | |
| mesa: caixa do jogo, tokens, tiles, bandejas | **manter procedural** | — | tokens viram moeda com relevo do SVG na Etapa 3 |

Pontos de atenção da Etapa 2:
- Os kits da Kenney costumam usar vários materiais por cor. O pipeline precisa escolher
  qual vira `faction`; a proposta é o material de maior área visível, com revisão na prancha.
- Confirmar no zip que cada pacote traz GLB/glTF. Se só houver FBX/OBJ, aviso antes de
  converter.

---

## 9. Totais

| | Recomendados (A) | Com alternativas (A+B) |
|---|---|---|
| Ícones de jogo (game-icons, **CC BY 3.0 — exigem crédito**) | **52** | 99 |
| Ícones de interface (Tabler MIT; Lucide ISC só se escolher B) | 38 | 76 |
| Modelos 3D (Kenney CC0) | ~15 modelos de 4–6 pacotes | — |

**Exigem crédito (CC BY 3.0), por autor, nos 52 recomendados:**
Lorc 24 · Delapouite 23 · Skoll 3 · Sbed 1 · Carl Olsen 1.
Tela de créditos: 5 linhas no formato "Icons made by {autor}. Available on https://game-icons.net".
As alternativas B acrescentariam John Redman, Quoting e Willdabeast.

MIT e ISC não exigem crédito na tela, só o texto da licença com o copyright no
`assets/LICENSES.md`. CC0 não exige nada.

---

## 10. Decisões para você (antes da Etapa 2)
1. **Aprovar a coluna A** (ou trocar linhas por B). Tudo que não for aprovado não é baixado.
2. **Dependências novas de desenvolvimento** para o pipeline: `svgo`,
   `@gltf-transform/cli` (+ `meshoptimizer`). O CLAUDE.md fixa a stack; isto acrescenta
   ferramentas de build, sem trocar nada. Ok?
3. **Conflito de documento:** ART_DIRECTION 10 diz que ícones são SVG feitos pelo Claude
   Code. Esta fase passa a usar ícones de terceiros com tratamento único. Posso atualizar o
   ART_DIRECTION na Etapa 3?
4. **Kenney:** aceita que o modelo exato de cada estrutura só seja fixado na prancha de
   revisão da Etapa 2?
