<!-- workflow-ia -->
## Workflow IA

Este projeto usa o plugin **Workflow IA** para executar cards do board de forma autônoma.

- Executar um card: `/workflow-ia:task <ID | URL | texto>`. Revisar o branch atual: `/workflow-ia:revisar`. Situação: `/workflow-ia:status`.
- Estado e provas de cada task ficam em `.workflow-ia/tasks/<ID>/` e só mudam pela CLI `.workflow-ia/wf`.
- `.workflow-ia/config.json` define os comandos do gate, os limites do loop (rodadas de revisão) e o board. **Só humanos editam.**
- **PR e merge são sempre do humano.** O agente entrega o branch e o texto do PR em `.workflow-ia/tasks/<ID>/pr.md`.
- Regras que valem mesmo fora de uma task:
  - nunca fazer push em branch protegido nem force push;
  - nunca ler ou editar `.env`;
  - nunca editar migration que já existe no branch base;
  - nunca usar `--no-verify`.
- Testes com critério de aceite levam a tag `[CA-n]` no nome. Os IDs são por task: a rastreabilidade só conta tags em linhas adicionadas ou alteradas no branch da task.
<!-- /workflow-ia -->
