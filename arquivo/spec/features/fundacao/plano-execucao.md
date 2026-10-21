# Plano de execução — fundacao

> gerado por `onp-spec plano` em 2026-08-17 17:59 — NÃO edite à mão;
> mudou tasks.md ou a config? Regenere: `onp-spec plano fundacao`

## Resumo — o que vai acontecer

- **19 tarefa(s) pendente(s)**: 19 em 19 faixa(s) paralela(s) + 0 sequencial(is) (1 já concluída(s): T-001)
- **1 faixa = 1 worktree + 1 branch + 1 janela de contexto limpa** — faixas não compartilham nenhum arquivo entre si
- prefere outra seleção ou uma após a outra? Regenere com `onp-spec plano fundacao --paralelizar T-xxx,T-yyy` ou `--sequencial`
- tudo acontece na branch de trabalho `spec/fundacao`; levar para a main é decisão sua

## Faixas e ondas

### Onda 1 — faixa-1 ∥ faixa-2 ∥ faixa-3

#### faixa-1 — branch `spec/fundacao-faixa-1` — worktree `worktrees/SC-fundacao-faixa-1`

| tarefa | título                             | modelo            | esforço | arquivos                                                                                                                                                                                                                                                                   |
| ------ | ---------------------------------- | ----------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-002  | Ambiente local sobe com um comando | `claude-sonnet-5` | high    | `infra/compose/docker-compose.yml`, `infra/compose/docker-compose.ci.yml`, `infra/compose/.env.compose.example`, `infra/traefik/traefik.yml`, `infra/traefik/dynamic/tls.yml`, `infra/traefik/dynamic/middlewares.yml`, `infra/scripts/setup.sh`, `infra/scripts/certs.sh` |

#### faixa-2 — branch `spec/fundacao-faixa-2` — worktree `worktrees/SC-fundacao-faixa-2`

| tarefa | título                                     | modelo            | esforço | arquivos                                                                                                        |
| ------ | ------------------------------------------ | ----------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| T-003  | Variáveis de ambiente validadas na partida | `claude-sonnet-5` | low     | `.env.example`, `apps/api/src/core/env.ts`, `apps/api/src/core/env.test.ts`, `infra/scripts/check-ambientes.sh` |

#### faixa-3 — branch `spec/fundacao-faixa-3` — worktree `worktrees/SC-fundacao-faixa-3`

| tarefa | título                                                       | modelo            | esforço | arquivos                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------ | ------------------------------------------------------------ | ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-004  | Migrações base, credenciais separadas e isolamento por linha | `claude-sonnet-5` | max     | `packages/database/package.json`, `packages/database/migrations/0001_extensoes_e_roles.sql`, `packages/database/migrations/0002_identidade.sql`, `packages/database/migrations/0003_lojas.sql`, `packages/database/migrations/0004_catalogo.sql`, `packages/database/migrations/0005_pedidos.sql`, `packages/database/migrations/0006_impressao_e_auditoria.sql`, `packages/database/policies/README.md`, `packages/database/src/migrate.ts`, `packages/database/src/migrate.test.ts` |

### Onda 2 — faixa-4 ∥ faixa-5 ∥ faixa-6

#### faixa-4 — branch `spec/fundacao-faixa-4` — worktree `worktrees/SC-fundacao-faixa-4`

| tarefa | título                                              | modelo            | esforço | arquivos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------ | --------------------------------------------------- | ----------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-005  | Guardas estruturais do banco no portão de qualidade | `claude-sonnet-5` | high    | `packages/database/guards/g1_isolamento_ativo.sql`, `packages/database/guards/g2_politica_por_comando.sql`, `packages/database/guards/g3_unica_por_loja.sql`, `packages/database/guards/g4_politica_cita_loja.sql`, `packages/database/guards/g5_indice_cobre_politica.sql`, `packages/database/guards/g6_sem_matview_multi_loja.sql`, `packages/database/guards/g7_view_com_invocador.sql`, `packages/database/guards/g8_pedido_imutavel.sql`, `packages/database/guards/g9_auditoria_sem_alteracao.sql`, `infra/scripts/db-guards.sh`, `.github/workflows/db-guards.yml` |

#### faixa-5 — branch `spec/fundacao-faixa-5` — worktree `worktrees/SC-fundacao-faixa-5`

| tarefa | título                                                      | modelo            | esforço | arquivos                                                                                                                         |
| ------ | ----------------------------------------------------------- | ----------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| T-006  | Caminho único de acesso ao banco com contexto por transação | `claude-sonnet-5` | max     | `apps/api/src/core/db.ts`, `apps/api/src/core/db.test.ts`, `apps/api/src/core/contexto.ts`, `apps/api/src/core/contexto.test.ts` |

#### faixa-6 — branch `spec/fundacao-faixa-6` — worktree `worktrees/SC-fundacao-faixa-6`

| tarefa | título                            | modelo            | esforço | arquivos                                                                                                                       |
| ------ | --------------------------------- | ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| T-007  | Banco de teste separado e efêmero | `claude-sonnet-5` | high    | `vitest.config.ts`, `packages/testing/src/db-test.ts`, `packages/testing/src/db-test.test.ts`, `packages/testing/package.json` |

### Onda 3 — faixa-7 ∥ faixa-8 ∥ faixa-9

#### faixa-7 — branch `spec/fundacao-faixa-7` — worktree `worktrees/SC-fundacao-faixa-7`

| tarefa | título                           | modelo            | esforço | arquivos                                                                                                                                                                               |
| ------ | -------------------------------- | ----------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-008  | Dados de exemplo determinísticos | `claude-sonnet-5` | high    | `packages/database/seed/index.ts`, `packages/database/seed/lojas.ts`, `packages/database/seed/catalogo.ts`, `packages/database/seed/pedidos.ts`, `packages/database/seed/seed.test.ts` |

#### faixa-8 — branch `spec/fundacao-faixa-8` — worktree `worktrees/SC-fundacao-faixa-8`

| tarefa | título                           | modelo            | esforço | arquivos                                                                                                       |
| ------ | -------------------------------- | ----------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| T-009  | Construtores de dados para teste | `claude-sonnet-5` | medium  | `packages/testing/src/factories.ts`, `packages/testing/src/factories.test.ts`, `packages/testing/src/index.ts` |

#### faixa-9 — branch `spec/fundacao-faixa-9` — worktree `worktrees/SC-fundacao-faixa-9`

| tarefa | título                          | modelo            | esforço | arquivos                                                                             |
| ------ | ------------------------------- | ----------------- | ------- | ------------------------------------------------------------------------------------ |
| T-010  | Prova de isolamento entre lojas | `claude-sonnet-5` | high    | `apps/api/tests/isolamento.test.ts`, `apps/api/tests/isolamento-concorrente.test.ts` |

### Onda 4 — faixa-10 ∥ faixa-11 ∥ faixa-12

#### faixa-10 — branch `spec/fundacao-faixa-10` — worktree `worktrees/SC-fundacao-faixa-10`

| tarefa | título                                       | modelo            | esforço | arquivos                                                                                                                                                                                                                                      |
| ------ | -------------------------------------------- | ----------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-011  | Contrato compartilhado e documento publicado | `claude-sonnet-5` | high    | `packages/contracts/package.json`, `packages/contracts/src/index.ts`, `packages/contracts/src/comum.ts`, `apps/api/src/contracts/gerar.ts`, `apps/api/src/contracts/gerar.test.ts`, `contrato/openapi.json`, `.github/workflows/contrato.yml` |

#### faixa-11 — branch `spec/fundacao-faixa-11` — worktree `worktrees/SC-fundacao-faixa-11`

| tarefa | título                                  | modelo            | esforço | arquivos                                                                                                                                                                                                                   |
| ------ | --------------------------------------- | ----------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-012  | Registro, erros e verificações de saúde | `claude-sonnet-5` | medium  | `apps/api/src/core/log.ts`, `apps/api/src/core/log.test.ts`, `apps/api/src/core/erros.ts`, `apps/api/src/core/erros.test.ts`, `apps/api/src/modules/health/health.routes.ts`, `apps/api/src/modules/health/health.test.ts` |

#### faixa-12 — branch `spec/fundacao-faixa-12` — worktree `worktrees/SC-fundacao-faixa-12`

| tarefa | título                                                         | modelo            | esforço | arquivos                                                                                                                                                                                                                     |
| ------ | -------------------------------------------------------------- | ----------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-013  | Borda de validação, origens autorizadas e limite de tentativas | `claude-sonnet-5` | high    | `apps/api/src/core/validar.ts`, `apps/api/src/core/validar.test.ts`, `apps/api/src/core/cors.ts`, `apps/api/src/core/cors.test.ts`, `apps/api/src/core/limite.ts`, `apps/api/src/core/limite.test.ts`, `apps/api/src/app.ts` |

### Onda 5 — faixa-13 ∥ faixa-14 ∥ faixa-15

#### faixa-13 — branch `spec/fundacao-faixa-13` — worktree `worktrees/SC-fundacao-faixa-13`

| tarefa | título                                  | modelo            | esforço | arquivos                                                                                                                      |
| ------ | --------------------------------------- | ----------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| T-014  | Trabalho em segundo plano com repetição | `claude-sonnet-5` | medium  | `apps/api/src/jobs/fila.ts`, `apps/api/src/jobs/fila.test.ts`, `apps/api/src/jobs/email.job.ts`, `apps/api/src/jobs/index.ts` |

#### faixa-14 — branch `spec/fundacao-faixa-14` — worktree `worktrees/SC-fundacao-faixa-14`

| tarefa | título                                        | modelo            | esforço | arquivos                                                                                                                                    |
| ------ | --------------------------------------------- | ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| T-015  | Cache com identificação de loja e invalidação | `claude-sonnet-5` | high    | `apps/api/src/core/cache.ts`, `apps/api/src/core/cache.test.ts`, `apps/web/src/server/cache.ts`, `apps/web/src/app/api/revalidate/route.ts` |

#### faixa-15 — branch `spec/fundacao-faixa-15` — worktree `worktrees/SC-fundacao-faixa-15`

| tarefa | título                              | modelo            | esforço | arquivos                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | ----------------------------------- | ----------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-016  | Design system com os quatro estados | `claude-sonnet-5` | high    | `packages/ui/package.json`, `packages/ui/styles/theme.css`, `packages/ui/src/index.ts`, `packages/ui/src/botao.tsx`, `packages/ui/src/campo.tsx`, `packages/ui/src/cartao.tsx`, `packages/ui/src/lista.tsx`, `packages/ui/src/aviso.tsx`, `packages/ui/src/dialogo.tsx`, `packages/ui/src/estados.tsx`, `packages/ui/src/tema-loja.tsx`, `apps/web/src/app/(dev)/ui/page.tsx` |

### Onda 6 — faixa-16 ∥ faixa-17 ∥ faixa-18

#### faixa-16 — branch `spec/fundacao-faixa-16` — worktree `worktrees/SC-fundacao-faixa-16`

| tarefa | título                                 | modelo            | esforço | arquivos                                                                                                                                                    |
| ------ | -------------------------------------- | ----------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-017  | Portão de qualidade local, com ganchos | `claude-sonnet-5` | high    | `Makefile`, `lefthook.yml`, `infra/scripts/verificar.sh`, `infra/scripts/check-segredos.sh`, `infra/scripts/check-sem-middleware.sh`, `docs/verificacao.md` |

#### faixa-17 — branch `spec/fundacao-faixa-17` — worktree `worktrees/SC-fundacao-faixa-17`

| tarefa | título                                           | modelo            | esforço | arquivos                                                                                                                     |
| ------ | ------------------------------------------------ | ----------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| T-018  | Publicação com migração antes da troca de versão | `claude-sonnet-5` | medium  | `infra/railway/pre-deploy.sh`, `infra/railway/README.md`, `apps/api/Dockerfile`, `apps/web/Dockerfile`, `docs/publicacao.md` |

#### faixa-18 — branch `spec/fundacao-faixa-18` — worktree `worktrees/SC-fundacao-faixa-18`

| tarefa | título                                            | modelo            | esforço | arquivos                                                                                                                                                                                                                                                                                   |
| ------ | ------------------------------------------------- | ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-019  | Esqueleto do Next e da API que sobe vazio e verde | `claude-sonnet-5` | medium  | `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css`, `apps/web/src/app/error.tsx`, `apps/web/src/app/not-found.tsx`, `apps/web/src/proxy.ts`, `apps/api/package.json`, `apps/api/src/main.ts` |

### Onda 7 — faixa-19

#### faixa-19 — branch `spec/fundacao-faixa-19` — worktree `worktrees/SC-fundacao-faixa-19`

| tarefa | título                                  | modelo            | esforço | arquivos                                                                                                                                                                                            |
| ------ | --------------------------------------- | ----------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-020  | Manifesto de rotas e cobertura de telas | `claude-sonnet-5` | high    | `apps/web/src/lib/routes.ts`, `e2e/playwright.config.ts`, `e2e/specs/rotas-manifesto.spec.ts`, `e2e/specs/manifesto-cobre-arquivos.spec.ts`, `e2e/specs/a11y.spec.ts`, `e2e/fixtures/auth.setup.ts` |

## Gestão de branches e commits

1. branch de trabalho `spec/fundacao` criada do ponto atual (se ainda não existir)
2. cada faixa nasce dela como branch própria e roda no seu worktree — **1 tarefa = 1 commit** (`T-xxx feature: título`)
3. terminou a onda → merge `--no-ff` de cada faixa de volta, na ordem; conflito interrompe a faixa e pede resolução humana
4. faixa mesclada → worktree removido, branch apagada, tarefa marcada `[concluida]` no tasks.md
5. gate final na branch de trabalho: `onp-spec verify fundacao` + `onp-spec audit --ci` — **exit 0 ou não está pronto**

## Como executar

### ▶ Execução — Claude Code headless

```bash
bash .spec/features/fundacao/executar-tarefas.sh
```

Cada faixa roda `claude -p` com **janela de contexto limpa**, no seu worktree, com
`--model` e `--effort` já definidos por tarefa e permissões `acceptEdits`. Os prompts exatos estão
embutidos no script — quer rodar uma faixa na mão, é só copiá-los de lá.
Logs: `worktrees/SC-fundacao-logs/`.

### 📣 Acompanhamento — tabela + resumo no chat (a cada 1 min)

O script roda em **background**: o agente AVISA o usuário antes de iniciar e,
enquanto roda, posta no chat a cada ~1 minuto a **tabela de andamento** (qual
tarefa está rodando, qual não está, o que concluiu/falhou) junto com o
**resumo geral de andamento** (escrito por IA; sem IA, o motor resume). Ao
final, o usuário recebe o resumo completo da execução. A qualquer momento:

```bash
onp-spec resumo fundacao --tabela   # a tabela de andamento
onp-spec resumo fundacao            # o resumo em texto
```
