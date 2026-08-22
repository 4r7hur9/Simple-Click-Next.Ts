# Plano de execução — identidade-visual-global

> gerado por `onp-spec plano` em 2026-08-22 05:23 — NÃO edite à mão;
> mudou tasks.md ou a config? Regenere: `onp-spec plano identidade-visual-global --paralelizar T-965,T-966`

## Resumo — o que vai acontecer

- **7 tarefa(s) pendente(s)**: 2 em 2 faixa(s) paralela(s) + 5 sequencial(is)
- **seleção do usuário**: paralelizar só T-965, T-966 — as demais rodam uma após a outra, ao final
- **1 faixa = 1 worktree + 1 branch + 1 janela de contexto limpa** — faixas não compartilham nenhum arquivo entre si
- prefere outra seleção ou uma após a outra? Regenere com `onp-spec plano identidade-visual-global --paralelizar T-xxx,T-yyy` ou `--sequencial`
- tudo acontece na branch de trabalho `spec/identidade-visual-global`; levar para a main é decisão sua

## Faixas e ondas

### Onda 1 — faixa-1 ∥ faixa-2

#### faixa-1 — branch `spec/identidade-visual-global-faixa-1` — worktree `../onp-worktrees/Simple-Click-Next.Ts-identidade-visual-global-faixa-1`

| tarefa | título                                                 | modelo  | esforço | arquivos                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | ------------------------------------------------------ | ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-965  | Instalar ativos oficiais e congelar os tokens da marca | `gpt-5` | high    | `apps/web/public/brand/logo-primary.svg`, `apps/web/public/brand/logo-reverse.svg`, `apps/web/public/brand/logo-monochrome-black.svg`, `apps/web/public/brand/logo-monochrome-white.svg`, `apps/web/public/brand/app-icon-light.svg`, `apps/web/public/brand/app-icon-dark.svg`, `packages/ui/styles/theme.css`, `packages/ui/src/tokens.ts`, `packages/ui/tests/tokens.test.ts`, `packages/ui/tests/contraste.test.ts` |

#### faixa-2 — branch `spec/identidade-visual-global-faixa-2` — worktree `../onp-worktrees/Simple-Click-Next.Ts-identidade-visual-global-faixa-2`

| tarefa | título                                                         | modelo  | esforço | arquivos                                                                      |
| ------ | -------------------------------------------------------------- | ------- | ------- | ----------------------------------------------------------------------------- |
| T-966  | Aplicar Space Grotesk e Inter sem depender da rede em execução | `gpt-5` | medium  | `apps/web/src/app/layout.tsx`, `apps/web/tests/tipografia-identidade.test.ts` |

## Tarefas sequenciais (após as ondas, na árvore principal)

| tarefa | título                                                  | modelo  | esforço | por que sequencial         |
| ------ | ------------------------------------------------------- | ------- | ------- | -------------------------- |
| T-967  | Expor os tokens como API semântica do Tailwind 4        | `gpt-5` | medium  | fora da seleção do usuário |
| T-968  | Definir a base global da interface                      | `gpt-5` | high    | fora da seleção do usuário |
| T-969  | Alinhar os componentes base à identidade oficial        | `gpt-5` | high    | fora da seleção do usuário |
| T-970  | Preservar a personalização isolada da loja e da landing | `gpt-5` | high    | fora da seleção do usuário |
| T-971  | Completar a vitrine interna da identidade               | `gpt-5` | medium  | fora da seleção do usuário |

## Gestão de branches e commits

1. branch de trabalho `spec/identidade-visual-global` criada do ponto atual (se ainda não existir)
2. cada faixa nasce dela como branch própria e roda no seu worktree — **1 tarefa = 1 commit** (`T-xxx feature: título`)
3. terminou a onda → merge `--no-ff` de cada faixa de volta, na ordem; conflito interrompe a faixa e pede resolução humana
4. faixa mesclada → worktree removido, branch apagada, tarefa marcada `[concluida]` no tasks.md
5. gate final na branch de trabalho: `onp-spec verify identidade-visual-global` + `onp-spec audit --ci` — **exit 0 ou não está pronto**

## Como executar

### ▶ Execução — Codex headless (codex exec)

```bash
bash .spec/features/identidade-visual-global/executar-tarefas.sh
```

Cada faixa roda `codex exec` com **janela de contexto limpa**, no seu worktree, com
`--model` e `model_reasoning_effort` já definidos por tarefa e sandbox `workspace-write`. Os prompts exatos estão
embutidos no script — quer rodar uma faixa na mão, é só copiá-los de lá.
Logs: `../onp-worktrees/Simple-Click-Next.Ts-identidade-visual-global-logs/`.

**Confirmação de custos — antes de executar**: os modelos e esforços por
tarefa estão nas tabelas acima; o agente CONFIRMA com o usuário se estão
dentro da licença/cota dele (modelo forte + esforço alto torra tokens).
Para gastar menos: `onp-spec plano identidade-visual-global --modelo gpt-5.6-luna --esforco baixo`
(tudo) ou por tarefa `onp-spec tarefa identidade-visual-global T-xxx --modelo <m> --esforco <nível>` — e regenere o plano.

### 📣 Acompanhamento — tabela + resumo no chat (a cada 1 min)

O script roda em **background**: o agente AVISA o usuário antes de iniciar e,
enquanto roda, posta no chat a cada ~1 minuto a **tabela de andamento** (qual
tarefa está rodando, qual não está, o que concluiu/falhou) junto com o
**resumo geral de andamento** (escrito por IA; sem IA, o motor resume). Ao
final, o usuário recebe o resumo completo da execução. A qualquer momento:

```bash
onp-spec resumo identidade-visual-global --tabela   # a tabela de andamento
onp-spec resumo identidade-visual-global            # o resumo em texto
```
