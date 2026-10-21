# Plano de execução — identidade-acesso

> gerado por `onp-spec plano` em 2026-08-23 13:49 — NÃO edite à mão;
> mudou tasks.md ou a config? Regenere: `onp-spec plano identidade-acesso --paralelizar T-100,T-101,T-102,T-103,T-104,T-105,T-108,T-106,T-107,T-109,T-110`

## Resumo — o que vai acontecer

- **11 tarefa(s) pendente(s)**: 11 em 10 faixa(s) paralela(s) + 0 sequencial(is)
- **seleção do usuário**: paralelizar só T-100, T-101, T-102, T-103, T-104, T-105, T-108, T-106, T-107, T-109, T-110 — as demais rodam uma após a outra, ao final
- **1 faixa = 1 worktree + 1 branch + 1 janela de contexto limpa** — faixas não compartilham nenhum arquivo entre si
- prefere outra seleção ou uma após a outra? Regenere com `onp-spec plano identidade-acesso --paralelizar T-xxx,T-yyy` ou `--sequencial`
- tudo acontece na branch de trabalho `spec/identidade-acesso`; levar para a main é decisão sua

## Faixas e ondas

### Onda 1 — faixa-1 ∥ faixa-2 ∥ faixa-3

#### faixa-1 — branch `spec/identidade-acesso-faixa-1` — worktree `worktrees/SimpleClick-identidade-acesso-run-identidade-acesso-faixa-1`

| tarefa | título                                        | modelo          | esforço | arquivos                                                                                                                                                                                                                                                             |
| ------ | --------------------------------------------- | --------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-100  | Cadastro de cliente final e política de senha | `gpt-5.6-terra` | high    | `apps/api/src/modules/auth/register.usecase.ts`, `apps/api/src/modules/auth/register.usecase.test.ts`, `apps/api/src/modules/auth/auth.schema.ts`, `apps/api/src/modules/auth/senha.ts`, `apps/api/src/modules/auth/senha.test.ts`, `packages/contracts/src/auth.ts` |

#### faixa-2 — branch `spec/identidade-acesso-faixa-2` — worktree `worktrees/SimpleClick-identidade-acesso-run-identidade-acesso-faixa-2`

| tarefa | título                                      | modelo          | esforço | arquivos                                                                                                                                                                                                                                                |
| ------ | ------------------------------------------- | --------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-101  | Verificação de e-mail com link de uso único | `gpt-5.6-terra` | medium  | `apps/api/src/modules/auth/verificar-email.usecase.ts`, `apps/api/src/modules/auth/verificar-email.usecase.test.ts`, `apps/api/src/modules/auth/codigos.repo.ts`, `apps/api/src/jobs/email.job.ts`, `apps/web/src/app/(conta)/verificar-email/page.tsx` |

#### faixa-3 — branch `spec/identidade-acesso-faixa-3` — worktree `worktrees/SimpleClick-identidade-acesso-run-identidade-acesso-faixa-3`

| tarefa | título                                     | modelo          | esforço | arquivos                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | ------------------------------------------ | --------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-102  | Login com senha e desafio de segundo fator | `gpt-5.6-terra` | high    | `apps/api/src/modules/auth/login.usecase.ts`, `apps/api/src/modules/auth/login.usecase.test.ts`, `apps/api/src/modules/auth/segundo-fator.usecase.ts`, `apps/api/src/modules/auth/segundo-fator.usecase.test.ts`, `apps/web/src/app/(conta)/entrar/page.tsx`, `apps/web/src/app/(conta)/entrar/verificacao/page.tsx`, `apps/web/src/features/auth/LoginForm.tsx`, `apps/web/src/features/auth/CodigoForm.tsx` |

### Onda 2 — faixa-4 ∥ faixa-5 ∥ faixa-6

#### faixa-4 — branch `spec/identidade-acesso-faixa-4` — worktree `worktrees/SimpleClick-identidade-acesso-run-identidade-acesso-faixa-4`

| tarefa | título                                            | modelo          | esforço | arquivos                                                                                                                                                                                                                                                                                                       |
| ------ | ------------------------------------------------- | --------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-103  | Sessão com cookie e rotação com detecção de reuso | `gpt-5.6-terra` | xhigh   | `apps/api/src/modules/auth/sessao.usecase.ts`, `apps/api/src/modules/auth/sessao.usecase.test.ts`, `apps/api/src/modules/auth/token.ts`, `apps/api/src/modules/auth/token.test.ts`, `apps/web/src/server/sessao.ts`, `apps/web/src/server/session-cookie.ts`, `apps/web/src/app/api/auth/[...action]/route.ts` |

#### faixa-5 — branch `spec/identidade-acesso-faixa-5` — worktree `worktrees/SimpleClick-identidade-acesso-run-identidade-acesso-faixa-5`

| tarefa | título                                   | modelo          | esforço | arquivos                                                                                                                                                                                            |
| ------ | ---------------------------------------- | --------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-104  | Encerrar sessão atual e todas as sessões | `gpt-5.6-terra` | medium  | `apps/api/src/modules/auth/logout.usecase.ts`, `apps/api/src/modules/auth/logout.usecase.test.ts`, `apps/web/src/app/(conta)/minha-conta/seguranca/page.tsx`, `apps/web/src/server/actions/auth.ts` |

#### faixa-6 — branch `spec/identidade-acesso-faixa-6` — worktree `worktrees/SimpleClick-identidade-acesso-run-identidade-acesso-faixa-6`

| tarefa | título                                        | modelo          | esforço | arquivos                                                                                                                                                                                                                    |
| ------ | --------------------------------------------- | --------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-105  | Recuperação de senha                          | `gpt-5.6-terra` | medium  | `apps/api/src/modules/auth/recuperar-senha.usecase.ts`, `apps/api/src/modules/auth/recuperar-senha.usecase.test.ts`, `apps/web/src/app/(conta)/recuperar-senha/page.tsx`, `apps/web/src/app/(conta)/definir-senha/page.tsx` |
| T-108  | Convite do dono e definição da primeira senha | `gpt-5.6-terra` | medium  | `apps/api/src/modules/auth/convite.usecase.ts`, `apps/api/src/modules/auth/convite.usecase.test.ts`, `apps/web/src/app/(conta)/definir-senha/page.tsx`                                                                      |

### Onda 3 — faixa-7 ∥ faixa-8 ∥ faixa-9

#### faixa-7 — branch `spec/identidade-acesso-faixa-7` — worktree `worktrees/SimpleClick-identidade-acesso-run-identidade-acesso-faixa-7`

| tarefa | título                                                | modelo          | esforço | arquivos                                                                                                                                                                                                                                                                        |
| ------ | ----------------------------------------------------- | --------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-106  | Papéis, escopo de acesso e auditoria do administrador | `gpt-5.6-terra` | high    | `apps/api/src/modules/auth/autorizar.ts`, `apps/api/src/modules/auth/autorizar.test.ts`, `apps/api/src/modules/admin/auditoria.repo.ts`, `apps/api/tests/autorizacao-papel.test.ts`, `apps/web/src/app/(painel)/painel/layout.tsx`, `apps/web/src/app/(admin)/admin/layout.tsx` |

#### faixa-8 — branch `spec/identidade-acesso-faixa-8` — worktree `worktrees/SimpleClick-identidade-acesso-run-identidade-acesso-faixa-8`

| tarefa | título                                           | modelo          | esforço | arquivos                                                                                                                                                                                                                                                                                                          |
| ------ | ------------------------------------------------ | --------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-107  | Aplicativo autenticador e códigos de recuperação | `gpt-5.6-terra` | high    | `apps/api/src/modules/auth/totp.usecase.ts`, `apps/api/src/modules/auth/totp.usecase.test.ts`, `apps/api/src/modules/auth/recovery-codes.ts`, `apps/api/src/modules/auth/recovery-codes.test.ts`, `apps/web/src/app/(conta)/minha-conta/seguranca/aplicativo/page.tsx`, `apps/web/src/features/auth/TotpForm.tsx` |

#### faixa-9 — branch `spec/identidade-acesso-faixa-9` — worktree `worktrees/SimpleClick-identidade-acesso-run-identidade-acesso-faixa-9`

| tarefa | título                           | modelo          | esforço | arquivos                                                                                                                   |
| ------ | -------------------------------- | --------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| T-109  | Proteção contra tentativa e erro | `gpt-5.6-terra` | medium  | `apps/api/src/modules/auth/lockout.ts`, `apps/api/src/modules/auth/lockout.test.ts`, `apps/api/tests/limite-login.test.ts` |

### Onda 4 — faixa-10

#### faixa-10 — branch `spec/identidade-acesso-faixa-10` — worktree `worktrees/SimpleClick-identidade-acesso-run-identidade-acesso-faixa-10`

| tarefa | título                           | modelo          | esforço | arquivos                                                                                         |
| ------ | -------------------------------- | --------------- | ------- | ------------------------------------------------------------------------------------------------ |
| T-110  | Telas de ponta a ponta de acesso | `gpt-5.6-terra` | medium  | `e2e/specs/login-2fa.spec.ts`, `e2e/specs/cadastro.spec.ts`, `e2e/specs/recuperar-senha.spec.ts` |

## Gestão de branches e commits

1. branch de trabalho `spec/identidade-acesso` criada do ponto atual (se ainda não existir)
2. cada faixa nasce dela como branch própria e roda no seu worktree — **1 tarefa = 1 commit** (`T-xxx feature: título`)
3. terminou a onda → merge `--no-ff` de cada faixa de volta, na ordem; conflito interrompe a faixa e pede resolução humana
4. faixa mesclada → worktree removido, branch apagada, tarefa marcada `[concluida]` no tasks.md
5. gate final na branch de trabalho: `onp-spec verify identidade-acesso` + `onp-spec audit --ci` — **exit 0 ou não está pronto**

## Como executar

### ▶ Execução — Codex headless (codex exec)

```bash
bash .spec/features/identidade-acesso/executar-tarefas.sh
```

Cada faixa roda `codex exec` com **janela de contexto limpa**, no seu worktree, com
`--model` e `model_reasoning_effort` já definidos por tarefa e sandbox `workspace-write`. Os prompts exatos estão
embutidos no script — quer rodar uma faixa na mão, é só copiá-los de lá.
Logs: `worktrees/SimpleClick-identidade-acesso-run-identidade-acesso-logs/`.

**Confirmação de custos — antes de executar**: os modelos e esforços por
tarefa estão nas tabelas acima; o agente CONFIRMA com o usuário se estão
dentro da licença/cota dele (modelo forte + esforço alto torra tokens).
Para gastar menos: `onp-spec plano identidade-acesso --modelo gpt-5.6-luna --esforco baixo`
(tudo) ou por tarefa `onp-spec tarefa identidade-acesso T-xxx --modelo <m> --esforco <nível>` — e regenere o plano.

### 📣 Acompanhamento — tabela + resumo no chat (a cada 1 min)

O script roda em **background**: o agente AVISA o usuário antes de iniciar e,
enquanto roda, posta no chat a cada ~1 minuto a **tabela de andamento** (qual
tarefa está rodando, qual não está, o que concluiu/falhou) junto com o
**resumo geral de andamento** (escrito por IA; sem IA, o motor resume). Ao
final, o usuário recebe o resumo completo da execução. A qualquer momento:

```bash
onp-spec resumo identidade-acesso --tabela   # a tabela de andamento
onp-spec resumo identidade-acesso            # o resumo em texto
```
