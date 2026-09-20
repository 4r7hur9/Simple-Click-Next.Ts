# Plano de execução — vitrine-publica

> gerado por `onp-spec plano` em 2026-09-20 01:41 — NÃO edite à mão;
> mudou tasks.md ou a config? Regenere: `onp-spec plano vitrine-publica --sequencial`

## Resumo — o que vai acontecer

- **modo SEQUENCIAL (escolha do usuário)**: 3 tarefa(s) pendente(s), UMA APÓS A OUTRA, na árvore principal (7 já concluída(s): T-400, T-401, T-402, T-403, T-404, T-405, T-406)
- sem worktrees e sem paralelismo — cada tarefa roda numa janela de contexto limpa, na ordem do tasks.md
- tudo acontece na branch de trabalho `spec/vitrine-publica`; levar para a main é decisão sua

## Ordem de execução (uma tarefa após a outra)

| tarefa | título                            | modelo         | esforço |
| ------ | --------------------------------- | -------------- | ------- |
| T-407  | Desempenho no celular             | `gpt-5.6-luna` | high    |
| T-408  | Acessibilidade e uso por teclado  | `gpt-5.6-luna` | medium  |
| T-409  | Teste de ponta a ponta da vitrine | `gpt-5.6-luna` | medium  |

## Gestão de branches e commits

1. branch de trabalho `spec/vitrine-publica` criada do ponto atual (se ainda não existir)
2. as tarefas rodam nela mesma, na ordem — **1 tarefa = 1 commit** (`T-xxx feature: título`), marcada `[concluida]` só com trabalho feito
3. gate final na branch de trabalho: `onp-spec verify vitrine-publica` + `onp-spec audit --ci` — **exit 0 ou não está pronto**

## Como executar

### ▶ Execução — Codex headless (codex exec)

```bash
bash .spec/features/vitrine-publica/executar-tarefas.sh
```

Cada tarefa roda `codex exec` com **janela de contexto limpa**, na árvore principal,
uma após a outra, com `--model` e `model_reasoning_effort` já definidos por tarefa e sandbox `workspace-write`.
Os prompts exatos estão embutidos no script.
Logs: `../onp-worktrees/Simple-Click-Next.Ts-vitrine-publica-logs/`.

**Confirmação de custos — antes de executar**: os modelos e esforços por
tarefa estão nas tabelas acima; o agente CONFIRMA com o usuário se estão
dentro da licença/cota dele (modelo forte + esforço alto torra tokens).
Para gastar menos: `onp-spec plano vitrine-publica --modelo gpt-5.6-luna --esforco baixo`
(tudo) ou por tarefa `onp-spec tarefa vitrine-publica T-xxx --modelo <m> --esforco <nível>` — e regenere o plano.

### 📣 Acompanhamento — tabela + resumo no chat (a cada 1 min)

O script roda em **background**: o agente AVISA o usuário antes de iniciar e,
enquanto roda, posta no chat a cada ~1 minuto a **tabela de andamento** (qual
tarefa está rodando, qual não está, o que concluiu/falhou) junto com o
**resumo geral de andamento** (escrito por IA; sem IA, o motor resume). Ao
final, o usuário recebe o resumo completo da execução. A qualquer momento:

```bash
onp-spec resumo vitrine-publica --tabela   # a tabela de andamento
onp-spec resumo vitrine-publica            # o resumo em texto
```
