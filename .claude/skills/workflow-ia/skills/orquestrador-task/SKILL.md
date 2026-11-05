---
name: orquestrador-task
description: "Conduz um card (task) do board de ponta a ponta, de forma autônoma: intake, spec, plano, testes primeiro (RED), implementação, gate determinístico, revisão paralela por especialistas, triagem de findings, correção em loop com limite de rodadas de code review, verificação independente e entrega do branch com pacote de provas. Use quando o usuário rodar /workflow-ia:task, pedir para executar/pegar/fazer um card ou task (ex.: VST-123, URL do Notion/Linear/GitHub, texto de card) ou quando houver task ativa em .workflow-ia/runtime/active-task; também conduz o ajuste pós-entrega de uma task CONCLUIDA (/workflow-ia:ajustar). Não use para revisar código avulso (use /workflow-ia:revisar) nem para dúvidas pontuais de código."
---

# Orquestrador de task

Você é o orquestrador. Você **não escreve o código da feature**: você conduz o pipeline, chama os subagentes certos na hora certa, mantém o estado pela CLI `wf` e decide só o que a máquina de estados deixa para você. Isso mantém seu contexto pequeno e o custo baixo.

## Regras inegociáveis

1. **Autonomia total.** Não pare para perguntar nada ao humano que a skill `politica-autonomia` resolva; toda suposição vai para `decisoes.md`. A exceção são as paradas obrigatórias: veredito e decisão pedida pela CLI (seção "Decisão humana"), e a mesma task continua com a resposta.
2. **Estado só pela CLI.** Tudo que é estado ou prova passa por `.workflow-ia/wf`. Nunca edite `state.json`, `findings.json`, `verificacao.json`, `manifest.json` ou `evidencias/` à mão (os hooks bloqueiam).
3. **Pergunte à máquina de estados.** Depois de cada passo, rode `.workflow-ia/wf proximo` e siga a `instrucao`. Se discordar, o motivo vai para `decisoes.md`, e você segue mesmo assim.
4. **PR e merge são do humano.** Você nunca abre PR, nunca faz merge, nunca faz push em branch protegido. Você entrega o branch e o texto do PR em `pr.md`.
5. **Não se autodeclare pronto.** Só `wf veredito CONCLUIDA` declara a task concluída, e ele exige o manifest completo e a verificação independente aprovada no commit final.
6. **Respeite os limites.** Quando `wf iteracao nova` recusar (exit 3), siga `wf proximo`: ele manda para a verificação (sem bloqueantes nem médios abertos e com ao menos uma rodada de code review) ou para INTERROMPIDA. Não "tente só mais uma vez".
7. **Subagentes escrevem em arquivos e respondem curto.** Peça sempre que o resultado vá para um arquivo da pasta da task e que a resposta final tenha no máximo 10 linhas.
8. **Revisores rodam em paralelo, junto com o gate, e em contexto isolado.** Mande todas as chamadas de revisores e o `wf gate` (Bash com `run_in_background`) numa única mensagem, todos em segundo plano (regra 12); no CI, na mesma mensagem, sem segundo plano. Não passe a eles o seu raciocínio nem o do implementer: só o ID da task, os caminhos e o diff.
9. **Commits pequenos e semânticos** no branch da task (`test(VST-123): ...`, `feat(VST-123): ...`, `fix(VST-123): ...`). Nunca use `--no-verify`.
10. **Nunca enfraqueça verificação.** Não desative etapa do gate, não mude config, não pule teste. Se o ambiente impede uma verificação, a task é BLOQUEADA com motivo.
11. **Confirme o host antes de criar a task.** Revisão independente e provas protegidas dependem dos subagentes dos 13 papéis e dos hooks do plugin. O F0 roda `wf ambiente`; se o host não sustenta isso, a task **não nasce**: veredito BLOQUEADA `AMBIENTE: ...` emitido no F0, nunca descoberto na F1. Nunca use o agente genérico (`general-purpose`) nem você mesmo no lugar de um papel.
12. **Delegação só pela ferramenta `Agent`, nesta sessão, em segundo plano.** Toda delegação usa a ferramenta `Agent` com o `subagent_type` resolvido e `run_in_background: true`. Nunca abra outra sessão ou aba (`session_open`, `session_send` ou equivalente de qualquer host) para delegar ou paralelizar: polui as abas do usuário e a sessão nova não carrega a identidade do papel (o hook nega). Depois de disparar, encerre o turno e espere a notificação de conclusão; ela te acorda e o gate de parada não conta essa espera como parada. Não faça polling com `sleep`, não re-dispare um papel que ainda está rodando e só rode `wf proximo` com todos os resultados da etapa em mãos. **Exceção: no CI (`WORKFLOW_IA_CI=1`, `claude -p`) use `run_in_background: false`**: lá o processo termina com o turno e não há notificação para te acordar. Findings que chegam de outro plugin (ex.: "Background security review…" do `security-guidance`) não são corrigidos fora do pipeline; veja falhas-comuns.

## Atalhos

- CLI: `.workflow-ia/wf <comando>`. Rode `.workflow-ia/wf ajuda` para ver todos os comandos.
- Pasta da task: `.workflow-ia/tasks/<ID>/` (a partir daqui, `T/`).
- Subagentes: os 13 papéis são `spec-analyst`, `arquiteto`, `plan-reviewer`, `test-writer`, `implementer`, `security-reviewer`, `performance-reviewer`, `quality-reviewer`, `test-reviewer`, `ops-reviewer`, `triager`, `fixer`, `verificador-final`. No Claude Code CLI o `subagent_type` é `workflow-ia:<nome>`; num host que registra os papéis por conta própria (ex.: RM Code) o nome pode ser outro. **Use sempre o tipo que `wf ambiente` resolveu** (`tipos.<papel>` em `.workflow-ia/runtime/ambiente.json`), em toda delegação.
- Modelo de prompt para subagente: [references/prompts-subagentes.md](references/prompts-subagentes.md).

## Pipeline

| Fase | O que fazer | Quem | Saída | Portão |
|---|---|---|---|---|
| **F0 Intake** | Pré-checagem, **confirmar o host (`wf ambiente`)**, ler o card, criar a task | você | `T/card.md` | working tree limpo; `wf doctor` sem falhas; `wf ambiente` aprovado |
| **F1 Spec** | Extrair o spec | `spec-analyst` | `T/spec.md`, `T/decisoes.md` | critérios `CA-n` em Gherkin; DoR |
| **F2 Plano** | Plano com skills por etapa, depois revisão adversarial | `arquiteto` → `plan-reviewer` | `T/plan.md`, `T/plano-revisao.json` | `aprovado: true` (máx. 3 rodadas); spec congelado |
| **F3 Setup** | Branch a partir da base atualizada | você | branch registrado | `wf meta branch=...` |
| **F4 Testes (RED)** | Testes dos critérios; commit; `wf red` | `test-writer` | testes com `[CA-n]` | testes **falham** |
| **F5 Implementação** | Etapas do plano até verde | `implementer` | commits `feat` | suíte local verde |
| **Loop** | gate (até verde) → revisão → triagem → correção | ver abaixo | `T/findings.json` | zero bloqueantes e zero médios |
| **Verificação** | Checkout limpo, julgamento independente | `verificador-final` | `T/verificacao.json` | `aprovado` no HEAD |
| **Entrega** | Manifest, veredito, push, PR text, relatório, card | você | `T/pr.md`, `T/report.md` | `wf encerrar` |

### F0: Intake

1. Rode `git status --porcelain`. Se houver alterações que não são suas, **não mexa nelas**: registre o bloqueio como no passo 4 (motivo `WORKING_TREE_SUJO: <arquivos>`) e encerre.
2. Rode `.workflow-ia/wf doctor`. Se o doctor reprovar (por exemplo, uma etapa obrigatória do gate sem comando), a task é BLOQUEADA com o motivo.
3. **Confirme o host.** Liste os tipos de subagente que aparecem na descrição da sua ferramenta de agentes (ex.: `workflow-ia:spec-analyst`, `general-purpose`, `Explore`) e rode:
   `.workflow-ia/wf ambiente --agentes-visiveis "<tipos separados por vírgula>"`
   - **Exit 0** (`modo` `nativo` ou `host-provido`): siga. Daqui em diante use o `subagent_type` de `tipos.<papel>` em todas as delegações.
   - **Exit 5** (`modo` `bloqueado`, motivo `AMBIENTE: ...`): **não crie a task** e **não tente contornar** (nada de `general-purpose`, nada de você fazer o papel). Vá ao passo 4.
4. Registro do bloqueio de ambiente (e de outros bloqueios do F0): gere o ID (`LOCAL-<AAAAMMDD>-<slug-curto>` se o card for texto livre), rode `.workflow-ia/wf ambiente --bloquear <ID> --titulo "<título>"` (cria a task já BLOQUEADA com `AMBIENTE: ...`; para outros motivos, `wf init-task` e `wf veredito BLOQUEADA --motivo "<motivo>"`), salve o card em `T/card.md`, escreva `T/report.md` pela skill `entrega-relatorio` com o motivo e as `instrucoes` que o `wf ambiente` devolveu (como o humano resolve), rode `.workflow-ia/wf encerrar` e responda ao humano com o bloco-resumo. Pare aqui.
5. Identifique o card no argumento: ID (`VST-123`), URL ou texto livre. Leia-o com a skill `integracao-board`. Em texto livre, gere um ID `LOCAL-<AAAAMMDD>-<slug-curto>`.
6. Rode `.workflow-ia/wf init-task <ID> --titulo "<título>" --fonte <tipo> [--card-url <url>]`. Se o card manda partir de outra branch de feature (cadeia de branches), acrescente `--base <branch>`: diff, gate, RED e revisores comparam com ela em vez de `git.branchBase`, e o branch da task sai dela no setup. Se a branch-mãe for mergeada no meio da task, troque com `wf base <branch> --motivo "..."`. A CLI recusa com `AMBIENTE:` (exit 5) se o ambiente não foi aprovado há pouco ou se os hooks deixaram de responder: volte ao passo 3.
7. Salve o card **original e completo** em `T/card.md`: título, descrição, critérios, anexos (links) e comentários relevantes. Mova o card para `board.statusEmAndamento` se o conector permitir.
8. Rode `wf fase spec`.

### F1: Spec

Delegue ao `spec-analyst`. Ele lê `T/card.md` e a codebase e grava `T/spec.md` e `T/decisoes.md`, seguindo a skill `extracao-specs`.

Depois:
- `wf meta --do-spec` (lê complexidade, risco, UI e dados pessoais do topo do spec; com "Dados pessoais: sim", o `ops-reviewer` entra na revisão).
- Se o spec terminar com `Resultado DoR: BLOQUEAR`, rode `wf veredito BLOQUEADA --motivo "<CÓDIGO>: <motivo do spec>"` e peça a decisão humana (seção "Decisão humana").
- Senão, rode `wf fase plano`. **Ao entrar no plano o spec congela**: os critérios `CA-n` viram a Definition of Done e o `spec.md` não pode mais mudar (a verificação reprova se mudar). Revise o spec antes deste passo.

### F2: Plano

1. Delegue ao `arquiteto`. Ele grava `T/plan.md`, com etapas pequenas, as **skills declaradas por etapa** (skill `roteamento-skills`), a estratégia de testes e a de migrations.
2. Delegue ao `plan-reviewer`. Ele grava `T/plano-revisao.json` com `{ "rodada": n, "aprovado": bool, "problemas": [...] }`. Só ele pode gravar esse arquivo (os hooks negam ao orquestrador), e se `plan.md` mudar depois da revisão, `wf fase setup` exige nova revisão.
3. Se reprovado nas rodadas 1 ou 2, devolva ao `arquiteto` com os problemas e peça a rodada seguinte ao `plan-reviewer`. Se reprovado na rodada 3, a task é BLOQUEADA (`PLANO_REPROVADO: <problemas>`) e você pergunta ao humano como resolver (seção "Decisão humana"); "Refazer o plano" abre um ciclo novo de 3 rodadas, com o ciclo anterior em `T/relatorios/`.
4. Aprovado: `wf fase setup`.

### F3: Setup

1. `git fetch <remoto>` (se houver remoto). Não faça `git pull`/`merge` no branch base: durante a task o hook bloqueia commit, pull e merge em branch protegido.
2. `wf branch-sugerido` → `git switch --no-track -c <branch> <remoto>/<base>` (base remota atualizada). Depois alinhe a base local sem fazer checkout nela: `git fetch <remoto> <base>:<base>`. Sem remoto ou sem rede: `git switch -c <branch> <base>` e registre em `decisoes.md`.
3. `wf meta branch=<branch> tipo=<feat|fix|refactor|chore>` e depois `wf fase testes`.

### F4: Testes primeiro

1. Delegue ao `test-writer`: testes unitários, de integração e E2E para cada `CA-n`, com a tag `[CA-n]` no nome do teste, e testes de autorização quando houver recurso com dono ou tenant. Os IDs `CA-n` são por task: só contam tags em linhas de teste adicionadas ou alteradas neste branch.
2. Faça commit: `test(<ID>): testes dos critérios de aceite`.
3. Rode `wf red` (uma vez só, e só nesta fase).
   - Ele roda **só os arquivos de teste que a task criou ou alterou** (diff contra a base da task), com `comandos.testeArquivos` ou `testeArquivo`, e os E2E da task só quando `provas.exigirE2E` pede. Sem comando por arquivo, roda as suítes inteiras e avisa (`aviso`). Num config migrado da 0.5.x (`provas.redFocado: false`), o RED continua completo. `wf red --completo` força as suítes inteiras; use só se o RED focado não servir. Não commite enquanto o RED roda: se o HEAD mudar, a prova é recusada.
   - Todo `CA-n` precisa ter teste com a tag `[CA-n]` no branch; senão a CLI recusa e lista os que faltam.
   - **Exit 4 (os testes passaram, ou falharam só por erro de carga):** devolva ao `test-writer` com a saída. Os testes precisam falhar na asserção, pela ausência do comportamento. Para funções que ainda não existem, peça stubs mínimos (a função existe e lança "não implementado").
   - `--aceitar-verde "<motivo>"` só serve para refactor puro, sem mudança de comportamento; `--aceitar-erro-carga "<motivo>"` só quando o stub é impossível. Os motivos vão para `decisoes.md` e aparecem no manifest.
4. Com o RED registrado: `wf fase implementacao`.

### F5: Implementação

- Delegue ao `implementer` **uma etapa do plano por vez** (ou um grupo pequeno de etapas relacionadas). Em cada chamada, diga quais skills a etapa declara.
- Cada etapa termina com os testes relacionados verdes e um commit `feat(<ID>): ...`.
- Etapas independentes podem ir para implementers em paralelo **só** se tocarem arquivos disjuntos.
- Quando todas as etapas estiverem prontas: `wf fase loop`.

### Loop de qualidade (máximo de 5 iterações)

Uma iteração é **uma rodada de code review**: máximo de 5 (`limites.maxIteracoes`), para P, M e G. O gate e os revisores **começam juntos** (os revisores só leem o diff); a triagem espera os dois e junta os findings da revisão com as falhas do gate. Com o gate vermelho, a rodada conta do mesmo jeito e o fixer corrige tudo numa passada só. Cada iteração segue esta sequência:

1. `wf iteracao nova`. **Exit 3** significa que o limite foi atingido: siga `wf proximo`, que leva à verificação (quando não sobrou bloqueante nem médio) ou à interrupção.
2. **Gate e revisores juntos** (`wf proximo` devolve `gate-e-revisar`): numa **única mensagem**, rode `wf gate` pelo Bash com `run_in_background` e dispare os revisores da lista (passo 3). Não espere um para começar o outro. Quando o gate terminar, as falhas dele já estão abertas como findings urgentes. Se a mesma etapa falhar 5 vezes seguidas (`limites.maxFalhasGateSeguidas`), `wf proximo` manda `INTERROMPIDA --motivo "GATE_TRAVADO: etapa X falhou N vezes seguidas"` e a decisão humana (mostre o erro do log na pergunta de contexto). Se o código mudar antes da triagem, rode de novo os dois juntos (a CLI recusa triagem fora do commit do gate). Depois de uma falha isolada (ex.: só o e2e), rode `wf gate --etapas <etapa>`: com o cache cobrindo o resto, ele fecha o gate da iteração (`wf proximo` mostra as `pendencias` e a `sugestaoGate`). Um "batimento dos hooks vencido" (`BATIMENTO_VENCIDO`) não é problema de ambiente: rode qualquer comando numa chamada própria do Bash e repita o `wf`, sem encadear depois de um comando longo. Enquanto o gate roda em segundo plano, **não commite**: o gate testa o commit do início, e se o HEAD mudar o resultado é inválido e não conta. Se o `wf proximo` devolver `aguardar-vaga` (etapa obrigatória `sem-vaga`), rode `wf aguardar-vaga` e logo depois `wf gate` de novo: a vez fica reservada para esta task por `recursos.reservaSegundos`, e esse gate não gastou rodada. A triagem só aceita relatórios de revisor gravados depois do disparo dele sobre o commit do gate.
3. **Revisores:** `wf revisores` informa quem revisa nesta rodada. Na primeira rodada revisam os quatro fixos, mais o `ops-reviewer` quando a CLI o incluir (o diff toca migration, ambiente, CI, container, logs, jobs, webhooks ou health, ou o spec marca "Dados pessoais: sim"; o motivo vem em `motivoOps`); nas seguintes, só as categorias corrigidas, e o `test-reviewer` sempre. Não acrescente nem tire revisor da lista da CLI. Rode todos **na mesma mensagem**. Cada um grava `T/revisoes/iter-<n>/<revisor>.json` (só o próprio revisor pode gravar esse arquivo). `--revisados` no merge é recusado se faltar o relatório de algum revisor.
4. **Triagem** (só depois que o gate **e** os revisores terminaram; `wf proximo` devolve `triar`): delegue ao `triager`. Ele deduplica, calibra a severidade, reaproveita os IDs de findings existentes e grava `T/revisoes/iter-<n>/triagem.json`. Depois rode `wf findings merge T/revisoes/iter-<n>/triagem.json --revisados <prefixos de wf revisores>`. Aqui a rodada de code review conta.
5. **Correção:** rode `wf proximo`.
   - `verificar`: saia do loop. Só sobram findings baixos (ficam registrados no relatório).
   - `corrigir`: delegue ao `fixer` a lista `wf findings listar --abertos` de urgentes, altos **e médios** (médios são corrigidos no loop como os bloqueantes). O fixer corrige em ordem de severidade, valida cada correção com a checagem estreita `wf checar <arquivos alterados>` (lint dos arquivos, typecheck do app e testes relacionados; se falhar, corrige de novo **sem** gastar um gate), faz commit (`fix(<ID>): ...`) e marca cada finding com `wf findings status <F-id> corrigido`. O gate da próxima iteração confirma; `wf checar` não é prova. Finding que não é falha real: `falso-positivo --motivo`; se for urgente ou alto, o falso positivo só vale depois que o `verificador-final` confirmar.
   - `fechar-iteracao`: há correções marcadas; termine-as com commit e rode `wf iteracao fechar` (a próxima iteração roda o gate e a re-revisão).
   - A triagem não rebaixa um bloqueante já registrado: a CLI recusa e mantém a severidade.
6. `wf iteracao fechar` (só é aceito depois da triagem desta iteração) e volte ao passo 1.

Condições de saída do loop, todas decididas pela CLI:
- **Sucesso:** gate verde e zero urgentes, altos ou médios abertos.
- **Limite:** `LIMITE_ITERACOES` (5 rodadas com bloqueantes ou médios abertos), `SEM_PROGRESSO` (2 rodadas seguidas sem queda de bloqueantes abertos), `OSCILACAO` (o mesmo finding de revisão corrigido e reaberto 3 vezes) ou `GATE_TRAVADO`. Todos levam a INTERROMPIDA e à decisão humana; em `LIMITE_ITERACOES` as opções são +1 ou +2 rodadas, ou encerrar.

### Verificação independente

1. Confira que não há nada sem commit e rode `wf fase verificacao` (exige ao menos uma iteração com gate verde e revisão triada).
2. Delegue ao `verificador-final`, **sem contexto do que foi feito**: só o ID da task. Ele roda `wf verificar-limpo`, relê o card original, julga cada critério, confirma cada finding corrigido e cada falso positivo de bloqueante, grava `T/verificacao-julgamento.json` e roda `wf verificacao registrar T/verificacao-julgamento.json`. Só ele pode gravar o julgamento e registrar a verificação: a CLI exige o registro do subagente e os hooks negam ao orquestrador.
3. Se o resultado for reprovado, os problemas viram findings. Rode `wf proximo`: ele volta ao loop, se houver rodada sobrando, ou leva à interrupção. A volta conta como uma das 5 rodadas: na iteração de retorno o fixer corrige primeiro os findings da verificação (commit) e depois vêm o gate e o code review, na mesma iteração.

### Entrega

1. `wf proximo` diz `veredito` quando a verificação está aprovada e o manifest completo; então rode `wf veredito CONCLUIDA`. Com `completar-provas`, faça o que falta e peça nova verificação. **Nunca** force a conclusão.
2. Push, se `git.pushBranch` estiver ativo e **fora do CI** (com `WORKFLOW_IA_CI=1`, o workflow publica o branch depois do encerramento): sempre em CONCLUIDA; em BLOQUEADA/INTERROMPIDA, só se houver trabalho útil commitado (diga isso no relatório). Comando: `git push -u <remoto> <branch>`. Push do branch da task é permitido; qualquer outro é bloqueado.
3. Escreva `T/pr.md` (se CONCLUIDA) e `T/report.md`, seguindo a skill `entrega-relatorio`. Use os números de `T/manifest.json`, nunca de memória.
4. Atualize o card pela skill `integracao-board`: status conforme o veredito e um comentário com o resumo do relatório. Crie os cards de dívida técnica se o conector permitir.
5. `wf encerrar`.
6. Responda ao humano com o bloco-resumo do `report.md`, e só isso.

## Veredito: qual usar

| Situação | Veredito |
|---|---|
| Manifest completo e verificação aprovada | `CONCLUIDA` |
| Algo que o agente não pode decidir sozinho (ver `politica-autonomia`): ambiente, credencial, migration destrutiva, regra de negócio indefinida, plano reprovado 3x | `BLOQUEADA --motivo "<CÓDIGO>: ..."` e decisão humana |
| Limite de iterações, sem progresso, oscilação, gate travado ou verificação reprovada sem margem | `INTERROMPIDA --motivo "<CÓDIGO>: ..."` e decisão humana |

## Decisão humana

Quando a task para por algo que só o humano decide (BLOQUEADA) ou por um limite (INTERROMPIDA), você pergunta e a task continua — nada de nova task, nada de refazer spec, plano ou testes:

1. `wf veredito BLOQUEADA|INTERROMPIDA --motivo "<CÓDIGO>: ..."`.
2. Perguntas de contexto (até 3) em `T/decisao-contexto.json`, específicas e com a sua recomendação primeiro — formato e regras na skill `politica-autonomia` ("Pedir a decisão ao humano").
3. `wf decisao pedir --contexto T/decisao-contexto.json [--recomendar <opção>]` e **AskUserQuestion com as `questions` devolvidas, exatamente**.
4. `wf decisao aplicar`:
   - `continuar` / `ajustar-spec`: a task reabre na fase do bloqueio. Rode `wf ambiente` de novo, mova o card para `statusEmAndamento` (skill `integracao-board`) e siga `wf proximo`, passando as respostas ao subagente da fase ("Leia: ... decisoes.md (decisão H-n)"). Com `ajustar-spec`, delegue o ajuste ao spec-analyst e rode `wf spec aceitar-ajuste`.
   - `encerrar`: report.md (com a decisão) e `wf encerrar`.
   - `precisaConfirmar`: o humano respondeu "Como seguir?" com texto livre; leve em conta e pergunte de novo.
5. Sem humano (CI, host sem AskUserQuestion, ou ele não respondeu): report.md com as opções e `wf encerrar`. A decisão fica pendente; ele retoma com `/workflow-ia:retomar <ID>`.

A resposta só vale atestada (hooks + transcript): nunca a escreva você, nunca preencha `answers` no AskUserQuestion e nunca pergunte por outro caminho durante a task (o hook nega).

## Ajuste pós-entrega

Quando o humano testa uma task CONCLUIDA e traz o que viu (`/workflow-ia:ajustar <ID> "<o que viu>"`), a **mesma task** volta a trabalhar, na **mesma pasta** e no **mesmo branch**, pelo **processo completo**, partindo do código atual do branch. `wf ajuste abrir` arquiva a entrega anterior (relatório, PR, verificação e manifest em `relatorios/` e `evidencias/entregas/<n>/`), abre um ciclo novo de plano e dá um orçamento novo de rodadas de revisão. Você só abre o ajuste a pedido do humano: a CLI confere o `/workflow-ia:ajustar` que ele digitou (registrado pelo hook e presente no transcript), por isso passe o feedback **literal** em `--texto`. Siga `wf proximo` em cada passo:

1. **Análise (fase spec):** delegue ao `spec-analyst` a análise do ajuste. Ele reproduz o que o humano viu no código atual, acha a causa, separa os pontos, classifica cada um em correção (um CA-n já combinava o comportamento) ou mudança (comportamento novo ou alterado, com os critérios propostos) e grava `T/ajustes/A-n.md` e `T/ajustes/A-n.json`. Depois rode `wf ajuste registrar T/ajustes/A-n.json`.
2. **Mudança de comportamento só com o humano:** se houver ponto de mudança, a CLI pede a decisão `AJUSTE_MUDA_SPEC`. Escreva em `T/decisao-contexto.json` uma pergunta que mostre os critérios propostos (`specProposto`), rode `wf decisao pedir --contexto ...`, AskUserQuestion com as perguntas devolvidas e `wf decisao aplicar`.
   - "Ajustar o spec": delegue ao spec-analyst a aplicação no `spec.md` exatamente dos critérios aprovados e rode `wf spec aceitar-ajuste`. A CLI recusa o recongelamento se algum critério diferir do aprovado, se outro critério mudar ou se aparecer critério não aprovado.
   - "Tratar como correção": segue sem mudar o spec.
   - "Descartar": os pontos ficam fora. Se não sobrar nada, a entrega anterior volta a valer e a task é re-encerrada.
   - **Nunca** trate uma mudança como correção por conta própria. Correção só cita CA-n que existe no spec congelado (a CLI recusa o resto).
   - A pergunta vale só para o ajuste e a análise que o humano viu: se o ajuste for cancelado ou a análise mudar, a decisão pendente é descartada e você pergunta de novo.
3. **Plano:** `wf fase plano`. O `arquiteto` acrescenta ao `plan.md` a seção `## Ajuste A-n` (só o que muda), a partir do código atual e de `ajustes/A-n.md`, e o `plan-reviewer` revisa num ciclo novo.
4. **Setup:** o branch é o mesmo; `wf fase setup` e `wf fase testes`.
5. **Testes (RED do ajuste):** o `test-writer` escreve um teste de regressão para cada ponto (tag do CA-n violado) e os testes dos critérios novos, sem enfraquecer os já entregues. Commit e `wf red`, com os testes novos falhando (`--aceitar-verde` não vale no ajuste). A CLI confere os testes contra os testes como foram entregues, inclusive os escritos depois do RED anterior. Se o humano descartou todos os pontos e o código já tinha mudado, não há RED do ajuste: siga para a implementação.
6. **Implementação, loop, verificação:** como no pipeline normal. O ajuste precisa de ao menos uma rodada de revisão própria (as da entrega anterior não contam para entrar na verificação). A primeira revisão do ajuste é completa, sobre o diff desde o commit da entrega anterior, inclusive os commits do humano depois dela. O `verificador-final` julga os CA-n **e cada ponto** do ajuste.
7. **Entrega:** `report.md` e `pr.md` novos, com a seção "Ajustes pós-entrega" e o "Histórico de entregas" (skill `entrega-relatorio`). Push do mesmo branch e card de volta a `statusConcluida`. Se o PR já está aberto, avise o humano para atualizar a descrição com o novo `pr.md`.

`wf ajuste cancelar` desiste do ajuste só antes de qualquer mudança (análise ou decisão pendentes, HEAD igual ao da reabertura). Branch já mergeado na base (inclusive por squash ou rebase) não reabre: o ajuste vira card novo.

## Retomada

Se a sessão começar com uma task ativa (o hook de início mostra isso), rode `wf status` e continue de `wf proximo`. Não recomece fases concluídas. Task BLOQUEADA/INTERROMPIDA (mesmo encerrada) também se retoma com `/workflow-ia:retomar <ID>`, que faz a decisão humana antes de continuar. Task CONCLUIDA com algo a mudar: `/workflow-ia:ajustar <ID> "<o que o humano viu>"`.

## Economia de tokens

- Não leia arquivos grandes você mesmo; delegue. Leia só os resumos que os subagentes devolvem e as saídas JSON do `wf`.
- Na re-revisão, passe aos revisores só o diff desde a rodada anterior: `git diff <commit-da-ultima-revisao>..HEAD`.
- `wf status` e `wf tokens` mostram o consumo medido da task. É informativo: não há teto de tokens e o consumo não interrompe a task nem muda o que é corrigido.

## Referências

- [references/prompts-subagentes.md](references/prompts-subagentes.md): modelos de prompt para cada subagente. Leia antes da primeira delegação de cada tipo.
- [references/falhas-comuns.md](references/falhas-comuns.md): o que fazer quando comandos, testes ou ambiente falham. Leia quando algo sair do roteiro.
