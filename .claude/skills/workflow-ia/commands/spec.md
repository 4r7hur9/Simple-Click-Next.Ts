---
description: Só lê o card e produz spec + plano revisado, sem implementar (para o humano revisar antes)
argument-hint: <ID do card | URL | texto do card>
---

Rode apenas as fases de intake, spec e plano do Workflow IA para o card: $ARGUMENTS

1. Carregue a skill `workflow-ia:orquestrador-task` e execute F0 (intake), F1 (spec) e F2 (plano com revisão do plan-reviewer).
2. Depois que o plano for aprovado (ou reprovado três vezes), **não** siga para o setup. Rode `.workflow-ia/wf pausar`, para que o hook de parada não force a continuação.
3. Responda ao usuário com:
   - complexidade, risco e UI;
   - a lista de critérios CA-n (uma linha cada);
   - as suposições de `decisoes.md`;
   - as etapas do plano com as skills de cada uma;
   - o resultado da revisão do plano.
4. Diga que, para continuar a execução autônoma a partir daqui, basta rodar `/workflow-ia:retomar <ID>`.
5. Avise que **o spec já está congelado** (a lista de critérios CA-n é a Definition of Done a partir do plano). Se o humano quiser mudar o spec antes de retomar:
   - editar `.workflow-ia/tasks/<ID>/spec.md` e depois rodar **no terminal dele, fora do Claude Code**, `.workflow-ia/wf spec recongelar` (sem isso, a task para pedindo a restauração do spec);
   - editar `plan.md` também é possível: ao retomar, o `wf proximo` pede uma nova rodada do plan-reviewer antes do setup.
