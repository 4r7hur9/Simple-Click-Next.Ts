---
description: Reabre uma task CONCLUIDA com o que você viu testando — mesma pasta, mesmo branch — e passa o ajuste pelo processo completo (análise do código atual, spec se preciso, plano, testes RED, implementação, revisão, verificação e nova entrega)
argument-hint: <ID da task> "<o que você viu testando>"
---

Ajuste pós-entrega com o Workflow IA: $ARGUMENTS

O primeiro token é o ID da task; o resto é o feedback do usuário, **literal** (não resuma nem reescreva).

1. Confirme que o projeto tem `.workflow-ia/config.json`. Se não houver ID ou feedback, peça os dois ao usuário e pare.
2. Rode `.workflow-ia/wf status --task <ID>`. Precisa ser veredito CONCLUIDA e fase `encerrada`.
   - BLOQUEADA/INTERROMPIDA, em andamento ou CONCLUIDA ainda sem encerrar (a entrega não terminou): siga `/workflow-ia:retomar <ID>` (ele pergunta o que o usuário decide, se for o caso, e continua a mesma task).
   - Se houver **outra** task ativa não encerrada, informe o usuário e pare.
3. Confirme o host: `.workflow-ia/wf ambiente --agentes-visiveis "<tipos de subagente que você vê>"`. Código 5 (`AMBIENTE:`): explique como resolver e pare.
4. Prepare o branch da task (`meta.branch` do status), partindo da situação **atual** do código:
   - working tree limpo (se não estiver, pare e mostre os arquivos ao usuário);
   - `git fetch <remoto>` (se houver remoto) e `git switch <branch>`;
   - se o remoto estiver à frente, `git merge --ff-only <remoto>/<branch>`. Se divergiu, pare e explique (o usuário decide como juntar).
5. Rode `.workflow-ia/wf ajuste abrir <ID> --texto "<feedback literal>"`. A CLI confere que o texto é o que o usuário digitou neste comando (registrado pelo hook): passe-o exatamente como veio. Recusa por "PR já mergeado" (inclusive squash ou rebase): o ajuste vira um card novo; informe o usuário e pare.
6. Mova o card para `board.statusEmAndamento` com um comentário citando o ajuste A-n e o feedback (skill `integracao-board`).
7. Carregue a skill `workflow-ia:orquestrador-task` e siga a seção **"Ajuste pós-entrega"**: a partir de `wf proximo`, sem pedir confirmação, até `wf encerrar`. A única pergunta ao usuário é a decisão humana quando o ajuste muda critérios de aceite.

Nunca abra PR e nunca faça merge. Sua última mensagem deve ser o bloco-resumo do novo `report.md`.
