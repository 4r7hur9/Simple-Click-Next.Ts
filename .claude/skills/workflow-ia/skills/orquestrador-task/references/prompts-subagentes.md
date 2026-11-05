# Modelos de prompt para os subagentes

O `subagent_type` de cada papel vem de `wf ambiente` (`tipos.<papel>` em `.workflow-ia/runtime/ambiente.json`): `workflow-ia:<papel>` no Claude Code CLI, e o nome que o host registrou nos demais. Nunca troque o papel por `general-purpose`.

Toda delegação é uma chamada da ferramenta `Agent` nesta sessão, com `run_in_background: true`: nada de abrir outra sessão ou aba (`session_open`/`session_send`). Dispare, encerre o turno e espere a notificação de conclusão antes do próximo passo. No CI (`WORKFLOW_IA_CI=1`), `run_in_background: false`.

Todos os prompts seguem o mesmo esqueleto. O subagente não herda a sua conversa: tudo o que ele precisa saber tem de estar no prompt ou em arquivos que ele vai ler.

```
Task: <ID> — <título>
Pasta da task: .workflow-ia/tasks/<ID>/
Seu trabalho: <uma frase>
Leia: <arquivos>
Grave: <arquivo(s) de saída>
Restrições: <o que não fazer>
Resposta final: no máximo 10 linhas, com o caminho dos arquivos gravados e o essencial.
```

## spec-analyst

```
Task: VST-123 — Cadastro de produto com grade
Pasta da task: .workflow-ia/tasks/VST-123/
Seu trabalho: transformar o card em spec executável.
Leia: card.md e a codebase (convenções, módulos relacionados, schema do banco).
Grave: spec.md (formato da skill extracao-specs) e decisoes.md (suposições e resoluções de ambiguidade).
Restrições: não pergunte nada ao humano; resolva pela skill politica-autonomia. Não escreva código.
Resposta final: complexidade, risco, UI, número de critérios CA-n e resultado da DoR.
```

## arquiteto

```
Task: VST-123
Seu trabalho: plano de implementação.
Leia: spec.md, decisoes.md, a codebase afetada.
Grave: plan.md com etapas pequenas; cada etapa declara "Skills:", arquivos, testes relacionados e cuidados.
Restrições: siga a skill roteamento-skills para as skills de cada etapa; migrations só no padrão expand/contract.
[Se for rodada 2 ou 3: "Problemas apontados pelo plan-reviewer em plano-revisao.json; resolva todos."]
[Depois de uma decisão humana: "Decisão humana H-n em decisoes.md (respostas do humano): aplique-a. Problemas do ciclo anterior em relatorios/plano-revisao-ciclo-*.json; resolva todos."]
Resposta final: número de etapas, skills envolvidas e riscos principais.
```

## plan-reviewer

```
Task: VST-123
Seu trabalho: revisão adversarial do plano (rodada <n>; sem plano-revisao.json, é a rodada 1 de um ciclo novo).
Leia: card.md, spec.md, decisoes.md (inclusive as decisões humanas H-n), plan.md e, se houver, relatorios/plano-revisao-ciclo-*.json.
Grave: plano-revisao.json = {"rodada": <n>, "aprovado": bool, "problemas": [{"gravidade": "bloqueia|melhoria", "etapa": "...", "descricao": "...", "sugestao": "..."}]}
Restrições: aprove só se todo CA-n estiver coberto e não houver risco de segurança, perda de dados ou migration destrutiva.
Resposta final: aprovado ou não, e os problemas que bloqueiam.
```

## test-writer

```
Task: VST-123
Seu trabalho: escrever os testes ANTES da implementação.
Leia: spec.md (critérios CA-n), plan.md (estratégia de testes), testes existentes para imitar o estilo.
Grave: arquivos de teste no projeto. Cada teste que cobre um critério tem [CA-n] no nome.
Restrições: não implemente a feature. Os testes devem falhar pela ausência do comportamento, não por erro de import. Inclua testes de autorização (usuário A x recurso de B) quando houver recurso com dono/tenant.
Resposta final: arquivos criados, número de testes por tipo e a matriz CA-n → teste.
```

## implementer

```
Task: VST-123
Seu trabalho: implementar a etapa <k> do plan.md: "<título da etapa>".
Skills desta etapa (carregue com a ferramenta Skill antes de começar): workflow-ia:backend-engenharia, workflow-ia:backend-seguranca, workflow-ia:banco-performance
Leia: plan.md (etapa <k>), spec.md, os testes [CA-...] relacionados.
Faça: implemente até os testes da etapa passarem; commit "feat(VST-123): <resumo>".
Restrições: não altere testes para fazê-los passar. Se um teste contradiz o spec, não mude o teste: registre em decisoes.md e relate na resposta; o orquestrador decide (e, se for o caso, delega a correção do teste ao test-writer com a justificativa). Nada fora do escopo do plano.
Resposta final: arquivos alterados, commit e o status dos testes da etapa.
```

## Revisores (security / performance / quality / test / ops)

```
Task: VST-123 — iteração <n>
Seu trabalho: revisão de <área> do diff da task (o `wf gate` roda ao mesmo tempo que você: não o rode nem espere por ele; só leia o código).
Diff: rode `git diff <base>...HEAD` (1ª rodada) ou `git diff <commit-anterior>..HEAD` (re-revisão).
Leia: spec.md, e os findings atuais da sua área com `.workflow-ia/wf findings listar`.
Grave: .workflow-ia/tasks/VST-123/revisoes/iter-<n>/<seu-nome>.json — lista de findings no formato da skill triagem-findings.
Para o ops-reviewer, inclua também: Motivo do disparo: <motivoOps de wf revisores>.
Restrições: só a sua área; cada finding com evidência (arquivo:linha e trecho) e recomendação concreta. Na re-revisão, informe o id de findings que continuam presentes.
Resposta final: número de findings por severidade.
```

## triager

```
Task: VST-123 — iteração <n>
Seu trabalho: consolidar as revisões da rodada (o gate desta iteração já terminou; se falhou, as falhas dele já estão no registro como findings urgentes de `gate/<etapa>`).
Leia: .workflow-ia/tasks/VST-123/revisoes/iter-<n>/*.json e `.workflow-ia/wf findings listar` (registro atual, inclusive os findings do gate).
Grave: .workflow-ia/tasks/VST-123/revisoes/iter-<n>/triagem.json (lista única, sem duplicatas, severidade calibrada pela rubrica, id reaproveitado quando for o mesmo problema).
Resposta final: totais por severidade e falsos positivos descartados (com motivo).
```

## fixer

```
Task: VST-123 — iteração <n>
Seu trabalho: corrigir estes findings, em ordem: <F-003 (urgente), F-005 (alto), F-007 (medio), ...>
Leia: `.workflow-ia/wf findings listar --abertos` para ver a descrição, a evidência, a recomendação e a skill de cada um; carregue a skill indicada em cada finding.
Faça: corrija; valide com `.workflow-ia/wf checar <arquivos alterados>` (lint, typecheck do app e testes relacionados; se falhar, corrija de novo antes de seguir); commit "fix(VST-123): <resumo> (F-003, F-005)"; marque cada um com `.workflow-ia/wf findings status <id> corrigido`.
Restrições: médios também são corrigidos; não enfraqueça testes; não mexa fora do necessário; se um finding for falso positivo, use `status <id> falso-positivo --motivo "..."`; se a causa for o ambiente (não o código), relate na resposta e não marque como corrigido.
Resposta final: por finding, corrigido / falso positivo / não resolvido e o motivo.
```

## verificador-final

```
Task: VST-123
Seu trabalho: verificação independente. Você não participou da implementação; confie só no que conseguir provar.
Faça: rode `.workflow-ia/wf verificar-limpo`; releia card.md (o original) e spec.md; julgue cada CA-n; confirme cada item de findingsParaConfirmar (correções e falsos positivos de bloqueantes) olhando o código; avalie os testes de autorização e as evidências de performance.
Grave: .workflow-ia/tasks/VST-123/verificacao-julgamento.json (formato da skill pacote-provas) e rode `.workflow-ia/wf verificacao registrar .workflow-ia/tasks/VST-123/verificacao-julgamento.json`.
Resposta final: resultado registrado pela CLI e os motivos, se reprovado.
```

## Ajuste pós-entrega (A-n)

O mesmo esqueleto, com o ajuste citado em cada prompt. A task, a pasta e o branch são os da entrega anterior.

### spec-analyst: análise do ajuste

```
Task: VST-123 — ajuste A-2 (feedback do humano depois da entrega 1)
Seu trabalho: analisar o ajuste a partir do código ATUAL do branch feat/VST-123-....
Leia: o feedback (state.json → ajuste.texto), card.md, spec.md (congelado), decisoes.md e relatorios/entrega-1-report.md; explore o código para reproduzir o que o humano viu e achar a causa.
Grave: ajustes/A-2.md (o que o humano viu, como reproduzir, causa no código, pontos, critérios afetados) e ajustes/A-2.json (itens com tipo correcao|mudanca, criterios, arquivo, reproducao, justificativa; specProposto se houver mudança).
Restrições: não edite spec.md nem código; correção aponta o CA-n violado; na dúvida, é mudança (o humano decide).
Resposta final: número de pontos, quantos são correção e quantos mudança, e os critérios propostos.
```

### spec-analyst: aplicar o spec aprovado

```
Task: VST-123 — ajuste A-2, decisão H-3 aprovou mudar o spec
Seu trabalho: aplicar no spec.md exatamente os critérios aprovados (specProposto em ajustes/A-2.json).
Restrições: não mude outros critérios; registre a mudança em decisoes.md citando A-2 e H-3.
Resposta final: critérios acrescentados/alterados.
```

### arquiteto, test-writer, implementer

```
arquiteto — Seu trabalho: acrescentar ao plan.md a seção "## Ajuste A-2" (só o que muda), a partir do código atual e de ajustes/A-2.md; cada etapa com skills, arquivos e o teste de regressão de cada ponto.
test-writer — Seu trabalho: um teste de regressão para cada ponto de ajustes/A-2.json (reproduz o que o humano viu, tag do CA-n violado) e os testes dos critérios novos; os testes já entregues não são removidos, pulados nem enfraquecidos; os novos precisam falhar.
implementer — Seu trabalho: as etapas da seção "Ajuste A-2" do plan.md até os testes de regressão passarem, sem quebrar o que já foi entregue; commits citam o ponto (A-2.1).
```

O verificador-final recebe o mesmo prompt de sempre; `wf verificar-limpo` devolve `ajuste.julgar` e ele julga cada ponto em `"ajustes"`.
