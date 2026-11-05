---
description: Mostra a situação da task ativa do Workflow IA (fase, rodadas de revisão, tokens, findings, próximo passo)
---

Rode `.workflow-ia/wf status` e apresente ao usuário, em poucas linhas:
- task, título e fase;
- rodadas de code review feitas/máximo (`rodadasRevisao`) e tokens consumidos (só informativo, sem teto);
- findings por severidade, com os bloqueantes abertos;
- último gate;
- próximo passo.

Se não houver task ativa, diga isso e liste as tasks existentes em `.workflow-ia/tasks/` com a fase e o veredito de cada uma (leia os `state.json`).

Não execute nenhum passo do pipeline.
