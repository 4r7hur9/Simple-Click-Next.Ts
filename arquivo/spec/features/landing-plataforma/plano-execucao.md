# Plano de execução — landing-plataforma

> gerado por `onp-spec plano` em 2026-09-20 01:41 — NÃO edite à mão;
> mudou tasks.md ou a config? Regenere: `onp-spec plano landing-plataforma --sequencial`

## Resumo — o que vai acontecer

- **modo SEQUENCIAL (escolha do usuário)**: 1 tarefa(s) pendente(s), UMA APÓS A OUTRA, na árvore principal (4 já concluída(s): T-960, T-961, T-962, T-964)
- sem worktrees e sem paralelismo — cada tarefa roda numa janela de contexto limpa, na ordem do tasks.md
- tudo acontece na branch de trabalho `spec/landing-plataforma`; levar para a main é decisão sua

## Ordem de execução (uma tarefa após a outra)

| tarefa | título                            | modelo         | esforço |
| ------ | --------------------------------- | -------------- | ------- |
| T-963  | Teste de ponta a ponta da landing | `gpt-5.6-luna` | medium  |

## Gestão de branches e commits

1. branch de trabalho `spec/landing-plataforma` criada do ponto atual (se ainda não existir)
2. as tarefas rodam nela mesma, na ordem — **1 tarefa = 1 commit** (`T-xxx feature: título`), marcada `[concluida]` só com trabalho feito
3. gate final na branch de trabalho: `onp-spec verify landing-plataforma` + `onp-spec audit --ci` — **exit 0 ou não está pronto**

## Como executar

### ▶ Execução — Codex headless (codex exec)

```bash
bash .spec/features/landing-plataforma/executar-tarefas.sh
```

Cada tarefa roda `codex exec` com **janela de contexto limpa**, na árvore principal,
uma após a outra, com `--model` e `model_reasoning_effort` já definidos por tarefa e sandbox `workspace-write`.
Os prompts exatos estão embutidos no script.
Logs: `worktrees/Simple-Click-Next.Ts-landing-plataforma-logs/`.

**Confirmação de custos — antes de executar**: os modelos e esforços por
tarefa estão nas tabelas acima; o agente CONFIRMA com o usuário se estão
dentro da licença/cota dele (modelo forte + esforço alto torra tokens).
Para gastar menos: `onp-spec plano landing-plataforma --modelo gpt-5.6-luna --esforco baixo`
(tudo) ou por tarefa `onp-spec tarefa landing-plataforma T-xxx --modelo <m> --esforco <nível>` — e regenere o plano.

### 📣 Acompanhamento — tabela + resumo no chat (a cada 1 min)

O script roda em **background**: o agente AVISA o usuário antes de iniciar e,
enquanto roda, posta no chat a cada ~1 minuto a **tabela de andamento** (qual
tarefa está rodando, qual não está, o que concluiu/falhou) junto com o
**resumo geral de andamento** (escrito por IA; sem IA, o motor resume). Ao
final, o usuário recebe o resumo completo da execução. A qualquer momento:

```bash
onp-spec resumo landing-plataforma --tabela   # a tabela de andamento
onp-spec resumo landing-plataforma            # o resumo em texto
```
