---
description: Retoma uma task de onde parou — pausada, com a sessão interrompida no meio, ou BLOQUEADA/INTERROMPIDA esperando uma decisão do usuário (aí pergunta o que ele decide, aplica a resposta e continua a mesma task, sem refazer spec, plano ou testes)
argument-hint: "[ID da task]"
---

Retome a task do Workflow IA: $ARGUMENTS

Um comando só para qualquer parada. O que muda é o motivo:
- **pausada ou a sessão caiu:** a task continua sozinha, sem perguntas;
- **BLOQUEADA ou INTERROMPIDA:** a task está esperando uma decisão do usuário. Ele está presente: você **pergunta** (AskUserQuestion) o que só ele pode decidir, e a mesma task continua com a resposta.

**1. Qual task.**
- Rode `.workflow-ia/wf status`. Se houver uma task ativa **diferente** do ID informado e ela não estiver encerrada, **não troque**: informe o usuário (ela está em andamento, talvez pausada) e pare. Ele termina aquela antes ou pede explicitamente para trocar (aí use `wf ativar <ID> --substituir-ativa`).
- Com ID: `.workflow-ia/wf ativar <ID>` (a CLI também recusa a troca nesse caso).
- Sem ID: use a task ativa. Sem task ativa, leia `.workflow-ia/runtime/registro-tasks.json` e escolha a mais recente (maior `encerradaEm`) com `veredito` BLOQUEADA ou INTERROMPIDA; entradas antigas sem `veredito`: confira em `.workflow-ia/tasks/<ID>/state.json`. Confirme com `wf status --task <ID>` e ative-a. Sem nenhuma, informe o usuário e pare.

**2. Tire a pausa:** `.workflow-ia/wf retomar` (sempre: uma task pode estar pausada **e** bloqueada).

**3. Escolha o caminho pelo `wf status`:**
- **CONCLUIDA e fase `encerrada`:** já foi entregue. Para mudar algo que o usuário viu testando, o caminho é `/workflow-ia:ajustar <ID> "<o que viu>"` (mesma task, mesmo branch). Informe isso e pare.
- **CONCLUIDA em outra fase** (a sessão caiu durante a entrega) ou **sem veredito** (em andamento): carregue a skill `workflow-ia:orquestrador-task` e continue a partir de `.workflow-ia/wf proximo`, até `wf encerrar`, sem pedir confirmação. Se o `wf proximo` devolver `perguntar` (decisão pendente, por exemplo de um ajuste), faça os passos 5 a 7.
- **BLOQUEADA ou INTERROMPIDA** (encerrada ou não): siga a decisão humana, passos 4 a 7.

**Decisão humana (task BLOQUEADA ou INTERROMPIDA):**

4. Rode `.workflow-ia/wf decisao status`.
   - Decisão `pendente` com `respostaRegistrada: true` (o usuário já respondeu e a sessão caiu antes de aplicar): vá direto ao passo 7.
   - Decisão `pendente` sem resposta: use as `questions` dela e vá ao passo 6.
   - Sem decisão pendente (por exemplo, task bloqueada antes da decisão humana existir, ou fechada sem humano): leia `report.md`, `decisoes.md` e, se for o caso, `relatorios/` e `plano-revisao.json` da task. Escreva em `.workflow-ia/tasks/<ID>/decisao-contexto.json` até 3 perguntas **específicas** sobre o que impediu a task (cada uma com `question`, `header` de até 12 caracteres e 2 a 4 `options` com `label` e `description`, a sua recomendação primeiro e marcada "(Recomendado)") e vá ao passo 5.
5. Rode `.workflow-ia/wf decisao pedir --retomada [--contexto .workflow-ia/tasks/<ID>/decisao-contexto.json]`. O `--retomada` diz à CLI que o usuário pediu para retomar e está presente (vale mesmo com `interacao.perguntarAoHumano=false`; no CI continua sem pergunta).
6. Chame **AskUserQuestion** com exatamente as `questions` devolvidas (sem mudar texto nem ordem e sem preencher respostas).
7. Rode `.workflow-ia/wf decisao aplicar`.
   - Reaberta (`continuar`/`ajustar-spec`): a CLI tira a pausa e reabre a task na fase do bloqueio. Carregue a skill `workflow-ia:orquestrador-task` e siga a seção "Decisão humana": `wf ambiente`, card para "em andamento", e o pipeline a partir de `wf proximo` até `wf encerrar`, sem pedir confirmação, passando a decisão H-n ao subagente da fase.
   - `encerrar`: atualize `report.md` com a decisão e rode `wf encerrar`.
   - `precisaConfirmar`: o usuário respondeu "Como seguir?" com texto livre; considere o que ele escreveu e pergunte de novo (passo 6).
   - Recusa por falta de resposta atestada: pergunte de novo pelo AskUserQuestion. Nunca escreva a resposta você mesmo.

Se este host não tiver a ferramenta AskUserQuestion, mostre as perguntas e as opções ao usuário e peça que ele responda no chat no formato `H-n: <opção>` (o hook registra a mensagem); depois rode `wf decisao aplicar`.
