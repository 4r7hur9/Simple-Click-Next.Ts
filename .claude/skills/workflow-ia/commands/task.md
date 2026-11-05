---
description: Executa um card do board de ponta a ponta, de forma autônoma (spec → testes → implementação → revisão → correção em loop → verificação → provas)
argument-hint: <ID do card | URL | texto do card>
---

Execute o card abaixo de ponta a ponta com o Workflow IA.

Card: $ARGUMENTS

Antes de tudo:
1. Confirme que o projeto tem `.workflow-ia/config.json`. Se não tiver, pare e diga ao usuário para rodar `/workflow-ia:instalar`.
2. Se já existir uma task ativa não encerrada (`.workflow-ia/wf status`) e ela for **outra** task, não a substitua: informe o usuário e pare.
3. Se a task ativa for este mesmo card, continue de onde parou (`.workflow-ia/wf proximo`).
3a. Se este card já tem uma task BLOQUEADA ou INTERROMPIDA (o `wf init-task` recusa e aponta o `/workflow-ia:retomar`), não recomece do zero: siga `/workflow-ia:retomar <ID>` — pergunte ao usuário o que ele decide e continue a mesma task. Só use `--nova-execucao` se ele pedir para recomeçar.
3b. Se este card já tem uma task **CONCLUIDA** (o `wf init-task` recusa e aponta o ajuste), não recomece do zero: se o usuário está trazendo o que viu testando, siga `/workflow-ia:ajustar <ID> "<o que ele viu>"` (mesma task, mesmo branch). Só use `--nova-execucao` se ele pedir para refazer o card do zero.
4. Para um card novo, o F0 da skill confirma o host (`wf ambiente`) **antes** de criar a task. Se o host não tem os subagentes do plugin ou os hooks, a task não nasce: ela é registrada como BLOQUEADA com `AMBIENTE:` e a instrução de como resolver.

Em seguida, carregue a skill `workflow-ia:orquestrador-task` e siga o pipeline dela à risca, do intake até `wf encerrar`, sem pedir confirmação ao usuário. As regras da skill `workflow-ia:politica-autonomia` substituem qualquer aprovação humana; só as paradas obrigatórias chegam ao usuário, como decisão pedida pela CLI (`wf decisao pedir` + AskUserQuestion), e a task continua com a resposta dele.

Nunca abra PR e nunca faça merge: entregue o branch e o texto do PR em `.workflow-ia/tasks/<ID>/pr.md`.

Sua última mensagem deve ser o bloco-resumo do `report.md`.
