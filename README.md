# PROJETO 3077 — Pacote para o Claude Code

Tudo que o Claude Code precisa para construir a versão digital 3D do Projeto 3077.

## Conteúdo
| Arquivo | Para quê |
|---|---|
| `CLAUDE.md` | Instruções lidas automaticamente pelo Claude Code: stack, arquitetura, regras |
| `docs/GDD.md` | Descrição completa do jogo e de todas as regras |
| `docs/ART_DIRECTION.md` | Estilo visual extraído das cartas v0.3, paleta, tipografia, pipeline de arte |
| `docs/UX_SPEC.md` | Telas, HUD, configurações, atalhos, animações, diálogos, tutorial |
| `docs/PROMPTS.md` | 14 fases com prompts prontos e critérios de aceite |
| `docs/DECISOES_ABERTAS.md` | Conflitos resolvidos e números ainda provisórios |
| `data/*.json` | Fonte da verdade: números, cartas, tiles, estruturas, eventos, facções, tratados |

## Como começar
1. Instale Node.js (versão LTS — Long-Term Support) e o Claude Code.
2. Crie uma pasta vazia, copie **todo** o conteúdo deste pacote para ela e rode `git init`.
3. Abra o Claude Code na pasta.
4. Cole o **prompt de abertura** de `docs/PROMPTS.md` seguido do prompt da **Fase 0**.
5. Aprove o plano, revise o resultado, faça commit, passe para a próxima fase em uma
   conversa nova.

## Rota recomendada
Fases 0–5 primeiro (rota rápida). A Fase 5 entrega o **simulador**, que responde as
perguntas de balanceamento em aberto do jogo físico. Decida a rota completa depois.
