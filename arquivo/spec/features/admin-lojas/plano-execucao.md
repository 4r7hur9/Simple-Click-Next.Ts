# Plano de execução — admin-lojas

> gerado por `onp-spec plano` em 2026-08-23 20:36 — NÃO edite à mão;
> mudou tasks.md ou a config? Regenere: `onp-spec plano admin-lojas`

## Resumo — o que vai acontecer

- **10 tarefa(s) pendente(s)**: 10 em 10 faixa(s) paralela(s) + 0 sequencial(is)
- **1 faixa = 1 worktree + 1 branch + 1 janela de contexto limpa** — faixas não compartilham nenhum arquivo entre si
- prefere outra seleção ou uma após a outra? Regenere com `onp-spec plano admin-lojas --paralelizar T-xxx,T-yyy` ou `--sequencial`
- tudo acontece na branch de trabalho `spec/admin-lojas`; levar para a main é decisão sua

## Faixas e ondas

### Onda 1 — faixa-1 ∥ faixa-2 ∥ faixa-3

#### faixa-1 — branch `spec/admin-lojas-faixa-1` — worktree `../onp-worktrees/SimpleClick-identidade-acesso-run-admin-lojas-faixa-1`

| tarefa | título                                                   | modelo          | esforço | arquivos                                                                                                                                                                                                                                                                                                                                      |
| ------ | -------------------------------------------------------- | --------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-200  | Cadastro de loja com código sequencial e convite do dono | `gpt-5.6-terra` | high    | `apps/api/src/modules/admin/criar-loja.usecase.ts`, `apps/api/src/modules/admin/criar-loja.usecase.test.ts`, `apps/api/src/modules/admin/admin.schema.ts`, `apps/api/src/modules/admin/documento.ts`, `apps/api/src/modules/admin/documento.test.ts`, `apps/web/src/app/(admin)/admin/lojas/nova/page.tsx`, `packages/contracts/src/admin.ts` |

#### faixa-2 — branch `spec/admin-lojas-faixa-2` — worktree `../onp-worktrees/SimpleClick-identidade-acesso-run-admin-lojas-faixa-2`

| tarefa | título                 | modelo          | esforço | arquivos                                                                                                                                                                                                       |
| ------ | ---------------------- | --------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-201  | Lista e busca de lojas | `gpt-5.6-terra` | medium  | `apps/api/src/modules/admin/listar-lojas.usecase.ts`, `apps/api/src/modules/admin/listar-lojas.usecase.test.ts`, `apps/web/src/app/(admin)/admin/lojas/page.tsx`, `apps/web/src/features/admin/ListaLojas.tsx` |

#### faixa-3 — branch `spec/admin-lojas-faixa-3` — worktree `../onp-worktrees/SimpleClick-identidade-acesso-run-admin-lojas-faixa-3`

| tarefa | título                                         | modelo          | esforço | arquivos                                                                                                                                                                                                         |
| ------ | ---------------------------------------------- | --------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-202  | Ficha da loja, edição e auditoria de alteração | `gpt-5.6-terra` | medium  | `apps/api/src/modules/admin/editar-loja.usecase.ts`, `apps/api/src/modules/admin/editar-loja.usecase.test.ts`, `apps/web/src/app/(admin)/admin/lojas/[id]/page.tsx`, `apps/web/src/features/admin/FichaLoja.tsx` |

### Onda 2 — faixa-4 ∥ faixa-5 ∥ faixa-6

#### faixa-4 — branch `spec/admin-lojas-faixa-4` — worktree `../onp-worktrees/SimpleClick-identidade-acesso-run-admin-lojas-faixa-4`

| tarefa | título                                          | modelo          | esforço | arquivos                                                                                                                                                                                                                    |
| ------ | ----------------------------------------------- | --------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-203  | Alteração do tipo de negócio pela administração | `gpt-5.6-terra` | high    | `apps/api/src/modules/admin/alterar-vertical.usecase.ts`, `apps/api/src/modules/admin/alterar-vertical.usecase.test.ts`, `apps/api/tests/vertical-somente-admin.test.ts`, `apps/web/src/features/admin/SeletorVertical.tsx` |

#### faixa-5 — branch `spec/admin-lojas-faixa-5` — worktree `../onp-worktrees/SimpleClick-identidade-acesso-run-admin-lojas-faixa-5`

| tarefa | título                                      | modelo          | esforço | arquivos                                                                                                                                       |
| ------ | ------------------------------------------- | --------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| T-204  | Apelido alterado preserva o endereço antigo | `gpt-5.6-terra` | medium  | `apps/api/src/modules/admin/alterar-apelido.usecase.ts`, `apps/api/src/modules/admin/alterar-apelido.usecase.test.ts`, `apps/web/src/proxy.ts` |

#### faixa-6 — branch `spec/admin-lojas-faixa-6` — worktree `../onp-worktrees/SimpleClick-identidade-acesso-run-admin-lojas-faixa-6`

| tarefa | título                                    | modelo          | esforço | arquivos                                                                                                                                                                                                                                                                                                                                       |
| ------ | ----------------------------------------- | --------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-205  | Contrato e documentos com link temporário | `gpt-5.6-terra` | high    | `apps/api/src/modules/files/assinar-upload.usecase.ts`, `apps/api/src/modules/files/assinar-upload.usecase.test.ts`, `apps/api/src/modules/files/tipo-de-arquivo.ts`, `apps/api/src/modules/files/tipo-de-arquivo.test.ts`, `apps/api/src/modules/admin/contratos.usecase.ts`, `apps/web/src/app/(admin)/admin/lojas/[id]/documentos/page.tsx` |

### Onda 3 — faixa-7 ∥ faixa-8 ∥ faixa-9

#### faixa-7 — branch `spec/admin-lojas-faixa-7` — worktree `../onp-worktrees/SimpleClick-identidade-acesso-run-admin-lojas-faixa-7`

| tarefa | título                                     | modelo          | esforço | arquivos                                                                                                                                                                                                             |
| ------ | ------------------------------------------ | --------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-206  | Suspender, reativar e excluir com retenção | `gpt-5.6-terra` | medium  | `apps/api/src/modules/admin/status-loja.usecase.ts`, `apps/api/src/modules/admin/status-loja.usecase.test.ts`, `apps/web/src/features/admin/AcoesLoja.tsx`, `apps/web/src/app/(loja)/l/[slug]/indisponivel/page.tsx` |

#### faixa-8 — branch `spec/admin-lojas-faixa-8` — worktree `../onp-worktrees/SimpleClick-identidade-acesso-run-admin-lojas-faixa-8`

| tarefa | título                             | modelo          | esforço | arquivos                                                                                                                                                                                                       |
| ------ | ---------------------------------- | --------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-207  | Funcionalidades liberadas por loja | `gpt-5.6-terra` | medium  | `apps/api/src/modules/admin/features.usecase.ts`, `apps/api/src/modules/admin/features.usecase.test.ts`, `apps/api/src/core/features.ts`, `apps/web/src/app/(admin)/admin/lojas/[id]/funcionalidades/page.tsx` |

#### faixa-9 — branch `spec/admin-lojas-faixa-9` — worktree `../onp-worktrees/SimpleClick-identidade-acesso-run-admin-lojas-faixa-9`

| tarefa | título                             | modelo          | esforço | arquivos                                                                                                                                                       |
| ------ | ---------------------------------- | --------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-208  | Histórico de auditoria consultável | `gpt-5.6-terra` | medium  | `apps/api/src/modules/admin/auditoria.usecase.ts`, `apps/api/src/modules/admin/auditoria.usecase.test.ts`, `apps/web/src/app/(admin)/admin/auditoria/page.tsx` |

### Onda 4 — faixa-10

#### faixa-10 — branch `spec/admin-lojas-faixa-10` — worktree `../onp-worktrees/SimpleClick-identidade-acesso-run-admin-lojas-faixa-10`

| tarefa | título                                  | modelo          | esforço | arquivos                                                              |
| ------ | --------------------------------------- | --------------- | ------- | --------------------------------------------------------------------- |
| T-209  | Telas de ponta a ponta da administração | `gpt-5.6-terra` | medium  | `e2e/specs/admin-lojas.spec.ts`, `e2e/specs/admin-documentos.spec.ts` |

## Gestão de branches e commits

1. branch de trabalho `spec/admin-lojas` criada do ponto atual (se ainda não existir)
2. cada faixa nasce dela como branch própria e roda no seu worktree — **1 tarefa = 1 commit** (`T-xxx feature: título`)
3. terminou a onda → merge `--no-ff` de cada faixa de volta, na ordem; conflito interrompe a faixa e pede resolução humana
4. faixa mesclada → worktree removido, branch apagada, tarefa marcada `[concluida]` no tasks.md
5. gate final na branch de trabalho: `onp-spec verify admin-lojas` + `onp-spec audit --ci` — **exit 0 ou não está pronto**

## Como executar

### ▶ Execução — Codex headless (codex exec)

```bash
bash .spec/features/admin-lojas/executar-tarefas.sh
```

Cada faixa roda `codex exec` com **janela de contexto limpa**, no seu worktree, com
`--model` e `model_reasoning_effort` já definidos por tarefa e sandbox `workspace-write`. Os prompts exatos estão
embutidos no script — quer rodar uma faixa na mão, é só copiá-los de lá.
Logs: `../onp-worktrees/SimpleClick-identidade-acesso-run-admin-lojas-logs/`.

**Confirmação de custos — antes de executar**: os modelos e esforços por
tarefa estão nas tabelas acima; o agente CONFIRMA com o usuário se estão
dentro da licença/cota dele (modelo forte + esforço alto torra tokens).
Para gastar menos: `onp-spec plano admin-lojas --modelo gpt-5.6-luna --esforco baixo`
(tudo) ou por tarefa `onp-spec tarefa admin-lojas T-xxx --modelo <m> --esforco <nível>` — e regenere o plano.

### 📣 Acompanhamento — tabela + resumo no chat (a cada 1 min)

O script roda em **background**: o agente AVISA o usuário antes de iniciar e,
enquanto roda, posta no chat a cada ~1 minuto a **tabela de andamento** (qual
tarefa está rodando, qual não está, o que concluiu/falhou) junto com o
**resumo geral de andamento** (escrito por IA; sem IA, o motor resume). Ao
final, o usuário recebe o resumo completo da execução. A qualquer momento:

```bash
onp-spec resumo admin-lojas --tabela   # a tabela de andamento
onp-spec resumo admin-lojas            # o resumo em texto
```
