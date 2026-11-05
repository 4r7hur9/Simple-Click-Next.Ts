---
description: Revisão especializada (segurança, performance, qualidade, testes e, quando o diff pede, operação/LGPD) do branch atual, com gate e findings triados — sem corrigir
argument-hint: "[branch base, ex.: main]"
---

Faça uma revisão completa do branch atual com o Workflow IA, **sem alterar código**.

Base de comparação: $ARGUMENTS (se vazio, use `git.branchBase` de `.workflow-ia/config.json`).

0. Confirme o host: `.workflow-ia/wf ambiente --agentes-visiveis "<tipos de subagente que você vê>"`. Se sair com código 5 (`AMBIENTE:`), pare e explique ao usuário como resolver (`instrucoes` do JSON). Use o `subagent_type` de `tipos.<papel>` nas delegações abaixo (no Claude Code CLI é `workflow-ia:<papel>`).
1. Se houver task ativa não encerrada (`.workflow-ia/wf status`), não continue: peça ao usuário para pausá-la ou encerrá-la antes.
2. Crie a revisão: `.workflow-ia/wf init-task REV-<AAAAMMDD>-<slug do branch> --titulo "Revisão de <branch>" --modo revisao --base <base>` (a mesma base deste comando; a CLI decide sobre ela se o `ops-reviewer` entra). A pasta é `.workflow-ia/tasks/<ID>/`. Se a task ativa foi pausada, acrescente `--substituir-ativa` (a CLI recusa enquanto houver task ativa não encerrada, mesmo pausada); depois a task volta com `/workflow-ia:retomar <ID>`.
3. Salve em `card.md` uma descrição do que o branch faz: use `git log <base>..HEAD --oneline` e a descrição do PR, se houver. Isso serve de contexto para os revisores.
4. Rode `.workflow-ia/wf gate --rotulo revisao`.
5. Rode `.workflow-ia/wf revisores` e, **em paralelo, numa única mensagem**, pela ferramenta `Agent` com `run_in_background: true` (nunca abra outra sessão ou aba, como `session_open`; o hook nega), os subagentes da lista `revisores`:
   - `workflow-ia:security-reviewer`
   - `workflow-ia:performance-reviewer`
   - `workflow-ia:quality-reviewer`
   - `workflow-ia:test-reviewer`
   - `workflow-ia:ops-reviewer`, só quando a CLI o incluir (o diff toca migration, ambiente, CI, container, logs, jobs, webhooks ou health); passe a ele o `motivoOps`.
   Cada um revisa `git diff <base>...HEAD` e grava `revisoes/iter-0/<nome>.json`.
   Como não há spec, peça que julguem pelo diff e pelas mensagens de commit.
   O test-reviewer ignora `wf testes-diff` (não há baseline).
   Encerre o turno e espere a notificação de conclusão de todos antes do passo 6.
6. Delegue ao `workflow-ia:triager` (também pela ferramenta `Agent`, nesta sessão) a consolidação em `revisoes/iter-0/triagem.json`. Depois rode `.workflow-ia/wf findings merge <arquivo> --por triager`.
7. Responda com:
   - o resultado do gate;
   - uma tabela de findings por severidade (id, severidade, arquivo:linha, descrição curta, recomendação);
   - um parágrafo com o que corrigir primeiro.
8. Rode `.workflow-ia/wf encerrar`.

Não corrija nada, a menos que o usuário peça depois.
