---
name: entrega-relatorio
description: "Fecha uma task do Workflow IA: escreve o texto do PR (pr.md) para o humano abrir, o relatório final (report.md) com números tirados do manifest, o bloco-resumo para o card, o push do branch da task e a criação de cards de dívida técnica. Use na fase de entrega, depois do veredito (CONCLUIDA, BLOQUEADA ou INTERROMPIDA), ou quando pedirem 'gera o relatório da task' ou 'texto do PR'. Não use para decidir se a task está pronta (use pacote-provas) nem para ler/atualizar o board em si (use integracao-board)."
---

# Entrega e relatório

O humano vai ler o relatório em um minuto e decidir se abre o PR. Ele precisa de números verdadeiros, do que foi assumido e do que ficou pendente, nessa ordem.

## Regras inegociáveis

1. **Números só do `manifest.json`** (rode `wf manifest` antes): testes, findings, iterações, tokens, commits. Nunca de memória.
2. **Nunca abra o PR.** Escreva `pr.md`; o humano abre com `gh pr create --body-file .workflow-ia/tasks/<ID>/pr.md` ou colando o texto.
3. **Suposições em destaque.** Todas as decisões de `decisoes.md` aparecem resumidas no relatório e no PR.
4. **Seja honesto no veredito.** BLOQUEADA e INTERROMPIDA dizem exatamente onde travou e o que o humano precisa decidir, com opções e a recomendação, e terminam com o caminho de retomada: `/workflow-ia:retomar <ID>`. Se houve decisões humanas (`decisoes` no state.json), liste-as.
5. **Ajuste pós-entrega documentado.** Se a task voltou por um ajuste (`resumo.ajuste` e `resumo.entregasAnteriores` no manifest, `ajustes` no state.json), o `report.md` e o `pr.md` trazem a seção do ajuste (feedback do humano, link para `ajustes/A-n.md`, pontos e como cada um foi resolvido e provado, decisão humana se houve) e o histórico de entregas. As entregas anteriores ficam em `relatorios/entrega-<n>-report.md` e `relatorios/entrega-<n>-pr.md`: cite-as, não as copie.
6. **Push só do branch da task**, e só quando `git.pushBranch` estiver ativo e o veredito for CONCLUIDA. Em BLOQUEADA/INTERROMPIDA, faça push apenas se houver trabalho útil commitado, e diga isso no relatório. **No CI (`WORKFLOW_IA_CI=1`) não faça push:** o job `publicar` do workflow envia o branch da task depois do encerramento; o relatório diz "publicado pelo CI".

## Passo a passo

1. `wf manifest` e leia `T/manifest.json`.
2. Push (quando aplicável e fora do CI): `git push -u <remoto> <branch>`.
3. Escreva `T/pr.md` (só em CONCLUIDA) com o template [references/templates.md](references/templates.md). Num ajuste, o PR é o mesmo (mesmo branch): se ele já estiver aberto, diga ao humano no relatório para atualizar a descrição com o novo `pr.md`.
4. Escreva `T/report.md` com o template do veredito correspondente.
5. Dívida técnica: para cada finding em `resumo.findings.dividaTecnica` com `ref` `pendente`, crie o card (skill `integracao-board`) e atualize a referência com `wf findings status <id> divida-tecnica --ref <ID do card>`. Cite os cards no `report.md` e no `pr.md`.
6. Atualize o card da task: status do veredito + comentário com o **bloco-resumo** do relatório.
7. `wf encerrar`.
8. Sua resposta final ao humano é o bloco-resumo, e nada mais.

## Bloco-resumo (topo do report.md e comentário no card)

```
✅ VST-123 — CONCLUÍDA
Cadastro de produto com grade de tamanhos e cores

Critérios de aceite: 6/6 provados (matriz no PR)
Testes: 41 unitários · 12 integração · 3 E2E — todos passando
TDD: testes falharam no commit a1f3c2 e passam no commit 9e7b10
Segurança: 0 findings abertos · 4 testes de autorização passando
Performance: 2 queries novas com índice (EXPLAIN anexo) · bundle +3,1 kB
Findings: 9 encontrados → 7 corrigidos · 1 falso positivo · 1 baixo registrado
Suposições: 2 (ver decisoes.md)
Rodadas de review: 2/5 · Tokens: 610k
Gate no loop: 7 etapas do cache · 2h 10min economizadas
Verificação independente: aprovada no commit 9e7b10
Branch feat/VST-123-cadastro-produto-grade pronto — PR e merge com você
```

Rodadas de review vêm de `resumo.rodadasRevisao`/`resumo.maxIteracoes` do manifest: são as rodadas de code review (as voltas gate → correção → gate não contam). Tokens são o consumo medido, só informativo: não há teto. A linha "Gate no loop" vem de `resumo.gateCache` (`etapasReaproveitadas` e `tempoEconomizadoMs`): o tempo economizado é a soma das durações originais das etapas reaproveitadas do cache entre as rodadas; omita a linha quando `etapasReaproveitadas` for 0. Use ⛔ para BLOQUEADA e ⏸️ para INTERROMPIDA. As contagens de testes vêm dos logs do gate de verificação; se o runner não informar a contagem, escreva "suíte verde" sem inventar números.

## Referências

- [references/templates.md](references/templates.md): templates de pr.md e report.md para os três vereditos.
