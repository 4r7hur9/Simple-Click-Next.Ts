# Arquitetura do Workflow IA

## Princípio

O agente não "decide tudo sozinho". Um orquestrador conduz fases com portões claros, e cada fase tem um agente especializado que carrega skills específicas.

Três camadas garantem o comportamento:

| Camada | O que é | Pode falhar? |
|---|---|---|
| **Skills** | Conhecimento e procedimento (o que fazer e como) | Sim: o modelo pode ignorar |
| **CLI `wf`** | Máquina de estados, provas e regras de conclusão (determinística) | Só se for contornada, e os hooks impedem isso |
| **Hooks** | Cercas executadas pelo Claude Code em toda chamada de ferramenta | Não dependem do modelo |

As verificações baratas e determinísticas (typecheck, lint, testes, build, SAST) rodam **antes** das revisões caras feitas por LLM.

## Estrutura do repositório

```
workflow-ia/
├─ .claude-plugin/
│  ├─ plugin.json            manifesto do plugin
│  └─ marketplace.json       marketplace "fabriki" (o próprio repositório)
├─ skills/                   25 skills (9 de orquestração + 16 de domínio)
├─ agents/                   13 subagentes
├─ commands/                 10 comandos /workflow-ia:*
├─ hooks/
│  ├─ hooks.json
│  └─ scripts/               inicio-sessao, guarda-bash, guarda-arquivos,
│                            guarda-agentes, guarda-sessoes, guarda-perguntas,
│                            pos-edicao, fim-subagente, gate-parada
├─ scripts/
│  ├─ wf.mjs                 CLI
│  ├─ instalar.mjs           instalador por projeto
│  └─ lib/                   core, findings, provas, fluxo, orcamento (medição de tokens)
├─ templates/                seção do CLAUDE.md e workflows do GitHub Actions
└─ docs/
```

## Estrutura no projeto instalado

```
.workflow-ia/
├─ config.json               comandos do gate, limites, board, proteções (humano edita)
├─ wf                        atalho da CLI
├─ runtime/                  (gitignored) sessão, task ativa, caminho do plugin
└─ tasks/<ID>/               (gitignored)
   ├─ card.md                card original (o verificador relê)
   ├─ spec.md                critérios CA-n + metadados
   ├─ decisoes.md            suposições do agente
   ├─ plan.md                etapas com "Skills:"
   ├─ plano-revisao.json     parecer do plan-reviewer
   ├─ state.json             máquina de estados (só a CLI escreve)
   ├─ findings.json          registro de findings (só a CLI escreve)
   ├─ revisoes/iter-N/       saída de cada revisor + triagem.json
   ├─ evidencias/            logs e JSON gerados pela CLI (red, gate, testes-diff)
   ├─ provas-extras/         EXPLAIN, bundle, Lighthouse (gerados por agentes)
   ├─ verificacao-julgamento.json
   ├─ verificacao.json       resultado registrado pela CLI
   ├─ manifest.json          Definition of Done com as provas
   ├─ pr.md                  texto do PR para o humano
   ├─ report.md              relatório final
   ├─ ajustes/A-n.md|.json   análise de cada ajuste pós-entrega (spec-analyst)
   └─ relatorios/            entregas anteriores (entrega-n-report.md, entrega-n-pr.md), bloqueios e ciclos de plano
```

## Fases e portões

| Fase | Agente | Portão (checado pela CLI) |
|---|---|---|
| intake | orquestrador | `card.md` existe |
| spec | spec-analyst | `spec.md` com pelo menos um `CA-n` |
| plano | arquiteto → plan-reviewer | spec congelado ao entrar (critérios viram a DoD; cópia em `evidencias/spec-congelado.md`); `plano-revisao.json` com `aprovado: true`, gravado só pelo plan-reviewer e mais novo que `plan.md` (no máximo 3 rodadas) |
| setup | orquestrador | branch registrado = branch atual |
| testes | test-writer | `wf red` (uma vez, só nesta fase): commit limpo, todo `CA-n` com teste marcado e falha de asserção (não de carga nem de ambiente) |
| implementacao | implementer (por etapa) | — |
| loop | gate + revisores (juntos) → triager → fixer | `wf iteracao nova` respeita os limites; triagem só depois que o gate da iteração terminou (verde ou vermelho), no mesmo commit, com os relatórios dos revisores disparados sobre ele; `wf iteracao fechar` só depois da triagem |
| verificacao | verificador-final | pelo menos uma iteração com gate verde e revisão triada; `wf verificacao registrar` (só pelo verificador-final) com gate limpo no HEAD e spec íntegro |
| entrega | orquestrador | `wf veredito` (CONCLUIDA exige manifest completo); BLOQUEADA/INTERROMPIDA → decisão humana (`wf decisao`), que pode reabrir a task |
| encerrada | — | `report.md` (e `pr.md` quando CONCLUIDA) |

## O loop

Uma iteração é **uma rodada de code review**: máximo de 5 (`limites.maxIteracoes`), para P, M e G. O gate e os revisores começam juntos (os revisores só leem o diff); a triagem espera os dois e junta os findings da revisão com as falhas do gate. Com o gate vermelho, a rodada conta do mesmo jeito.

```
wf iteracao nova ──► wf gate (segundo plano) ─┐   mesma mensagem, mesmo commit
      ▲          └─► revisores em paralelo ───┤   (1ª rodada: 4 fixos + ops-reviewer se o diff/spec
      │                                       │    pedir; depois: só os das categorias corrigidas,
      │                                       │    mais o test-reviewer)
      │                                       ▼
      │              os dois terminaram ──► triager ──► wf findings merge   (aqui a rodada conta)
      │                 │                       (as falhas do gate já são findings urgentes;
      │                 │                        mesma etapa 5x seguidas → GATE_TRAVADO)
      │     só baixos abertos e gate verde? ──sim──► verificação
      │                 │ não
      │                 ▼
      │     fixer (urgente → alto → médio; valida com wf checar) ──► commit ──► wf iteracao fechar
      └─────────────────────────────────────────────────────────┘
```

O gate em si (0.6.0): com `gate.falharRapido`, roda em ondas por custo e corta as ondas seguintes quando uma etapa obrigatória falha. Uma falha de carga é repetida (`gate.repetirPorCarga`), as etapas da mesma onda rodam em paralelo (`gate.paralelismo`) e as etapas pesadas esperam uma vaga de recurso da máquina (`recursos`). No loop, as etapas cujos insumos não mudaram vêm do cache. A verificação final (`wf verificar-limpo`) ignora o falhar rápido e o cache e roda tudo. Uma etapa com `dependeDe` (0.7.0) espera as dependências terminarem e, se alguma não passou, fica `pulada-por-dependencia` sem pegar vaga nem rodar, no loop e na verificação; a pulada nunca aprova. Com o modo CI ligado (`config.ci`, 0.7.0), a verificação ganha a etapa sintética `teste-ci` (`lib/ci.mjs`; provedor GitHub em `lib/ci-github.mjs`), que faz push do branch da task, dispara o workflow e espera o run do mesmo SHA; as etapas de `ci.etapas` ficam `origem: "ci"` e são lidas do run. `wf ci gerar` (`lib/ci-gerar.mjs`, sobre a detecção de `lib/stack.mjs`) propõe o yml em `.workflow-ia/ci/`, nunca em `.github/`. Veja `docs/configuracao.md#gate` e `#ci`.

- `wf iteracao fechar` só é aceito depois da triagem da iteração.
- Médios são corrigidos no loop como os bloqueantes. Baixos só são registrados e aparecem no relatório.
- Verificação reprovada volta ao loop e a volta conta como uma das 5 rodadas: na iteração de retorno o fixer corrige primeiro os findings da verificação, depois vêm o gate e o code review na mesma iteração.
- Tokens são medidos e mostrados (`wf status`, `wf tokens`, manifest), sem teto: nunca interrompem a task.

Condições de parada, avaliadas pela CLI (todas levam a INTERROMPIDA e à decisão humana):

| Código | Quando |
|---|---|
| `LIMITE_ITERACOES` | 5 rodadas de code review feitas com bloqueantes ou médios abertos. Sem nenhum aberto, vai para a verificação confirmar as últimas correções. Opções ao humano: +1 ou +2 rodadas, ou encerrar |
| `SEM_PROGRESSO` | O número de bloqueantes abertos não caiu em 2 rodadas de revisão seguidas (`semProgressoPor`; só contam rodadas com gate verde e triagem, e a contagem recomeça ao voltar da verificação) |
| `OSCILACAO` | O mesmo finding de revisão foi corrigido e reaberto 3 vezes. Falha repetida no gate não conta aqui |
| `GATE_TRAVADO` | A mesma etapa do gate falhou 5 vezes seguidas (`GATE_TRAVADO: etapa X falhou N vezes seguidas`). Opções: continuar com mais 5 tentativas ou encerrar |
| `VERIFICACAO_REPROVADA` | A verificação reprovou e não há rodada sobrando para voltar ao loop |

## Findings

- **Severidades:**
  - `urgente` e `alto` bloqueiam;
  - `medio` é corrigido no loop, como os bloqueantes;
  - `baixo` só é registrado e aparece no relatório.
- **Status:** `aberto → corrigido → verificado`, `reaberto`, `falso-positivo` (com motivo), `divida-tecnica` (só médio/baixo) e `aceito-risco` (só o humano, editando o arquivo).
- **Deduplicação:** o triager reaproveita o `id` do mesmo problema. A CLI também casa por fingerprint (categoria + arquivo + descrição).
- **Verificação:** um finding `corrigido` vira `verificado` quando a re-revisão da sua área não o reporta de novo, quando o gate passa (findings de gate) ou quando o verificador final confirma.

## Provas e Definition of Done

`wf manifest` monta a DoD a partir de artefatos:

| Item | Prova |
|---|---|
| criterios | tags `[CA-n]` em linhas de teste adicionadas/alteradas no branch, mais o julgamento do verificador |
| tdd | `evidencias/red.json` (commit + exit codes dos testes falhando) |
| testes-integros | `evidencias/testes-diff.json` contra o baseline do RED |
| gate-limpo | `evidencias/verificacao/gate.json` com `ok`, `limpo` e `commit == HEAD` |
| seguranca:* | logs de SAST, dependências e segredos; julgamento de autorização |
| performance | julgamento + arquivos em `provas-extras/` |
| findings | zero bloqueantes abertos ou não confirmados; médios resolvidos ou em dívida |
| verificacao | `verificacao.json` aprovado no HEAD |
| decisoes | `decisoes.md` presente |

## Hooks

| Hook | Evento | O que garante |
|---|---|---|
| `inicio-sessao` | SessionStart | Registra o caminho do plugin e a sessão; injeta o estado da task ativa; em `startup`/`resume`, grava `runtime/subagentes-corte.json` (subagentes de um processo anterior não seguram mais o gate de parada) |
| `guarda-bash` | PreToolUse(Bash) | Bloqueia: PR/merge; push em branch protegido, de outro branch ou forçado; `--no-verify`; commit/merge em branch protegido durante a task; leitura de `.env`/`printenv`; escrita em estado/provas/CI; comandos destrutivos de banco; `rm -rf` amplo; deploy em produção; o instalador durante a task |
| `guarda-arquivos` | PreToolUse(Write/Edit) | Bloqueia: `.env*`; estado/provas; CI, `.husky` e `.claude/settings`; lockfiles; migrations que existem no branch base |
| `guarda-agentes` | PreToolUse(Task/Agent) | Registra cada subagente iniciado (`runtime/subagentes.jsonl`, usado para exigir o verificador-final) e mede o consumo de tokens da task (informativo; nunca nega) |
| `guarda-sessoes` | PreToolUse(`mcp__*__session_open`/`session_send`) | Durante a task (não pausada nem encerrada), nega abrir ou conduzir outra sessão de chat (ex.: abas do RM Code); subagente nunca pode. Toda delegação vai pela ferramenta `Agent`, nesta sessão |
| `pos-edicao` | PostToolUse(Write/Edit) | Formata e roda o lint no arquivo (os erros voltam ao agente); typecheck opcional; registra edições em testes depois do RED |
| `fim-subagente` | SubagentStop | Registra o fim de cada subagente (`runtime/subagentes-fim.jsonl`) |
| `gate-parada` | Stop | Impede encerrar a sessão no meio da task (devolve o próximo passo); libera após N bloqueios sem progresso. Com subagente disparado pela sessão principal neste processo e ainda sem `SubagentStop` (até `limites.esperaSubagenteMin`), deixa parar sem contar bloqueio: o orquestrador está esperando a notificação de conclusão. No CI (`WORKFLOW_IA_CI=1`) essa exceção não vale |

Os hooks só agem em projetos com `.workflow-ia/config.json`. Nos demais, saem imediatamente.

Todo hook carimba `runtime/heartbeat.json` (e o `PreToolUse(Bash)`, `runtime/heartbeat-bash.json`): é a prova de vida que `wf ambiente` e a guarda de estado da CLI usam para recusar um host sem hooks. Os **git hooks** (`pre-commit`, `pre-push`) são a segunda linha de defesa e valem em qualquer host.

## Decisão humana e retomada

Uma task que para por algo que só o humano decide (BLOQUEADA) ou por um limite (INTERROMPIDA) não morre: o agente da sessão pergunta e a mesma task continua.

```
veredito BLOQUEADA|INTERROMPIDA ──► wf decisao pedir ──► AskUserQuestion ──► wf decisao aplicar
   (grava bloqueio.fase)            (perguntas + "Como     (hook Pre confere;   ├─ continuar → reabre na fase do bloqueio
                                      seguir?" da CLI)       hook Post registra)  └─ encerrar  → relatório e encerrar
```

- **O que a CLI decide:** a pergunta "Como seguir?" e seus efeitos saem do código do motivo (PLANO_REPROVADO → ciclo novo de 3 rodadas do plano; LIMITE_ITERACOES, SEM_PROGRESSO, OSCILACAO, VERIFICACAO_REPROVADA → +1/+2 rodadas de code review; GATE_TRAVADO → mais 5 tentativas do gate; SPEC_MUDOU → ajustar o spec uma vez; AMBIENTE → "já resolvi"). O agente só escreve as perguntas de contexto, sem efeito. O efeito aparece na descrição de cada opção: o humano vê o que está aprovando.
- **Quem atesta a resposta:** o hook `PreToolUse(AskUserQuestion)` só deixa passar as perguntas exatas da decisão pendente (hash) e nega respostas pré-preenchidas e perguntas de subagente; o `PostToolUse` grava a resposta em `runtime/respostas-humano.jsonl` (só hooks e CLI escrevem ali). `wf decisao aplicar` exige esse registro **e** o mesmo `tool_use`/`tool_result` no transcript da sessão. Divergência vira `alertaForja` no estado. Resposta digitada no chat (`H-n: <opção>`) vale pelo mesmo caminho, via `UserPromptSubmit`.
- **O que muda e o que não muda ao reabrir:** fase volta para `bloqueio.fase`; veredito, motivo e encerramento são limpos; `report.md` (e `plano-revisao.json`, se a fase for o plano) vão para `relatorios/`; extensões de limite entram em `limitesExtra`. Tokens medidos e iterações feitas, spec congelado, RED, findings e provas ficam como estavam. A decisão vai para `state.json` (`decisoes`, fonte de verdade) e para `decisoes.md` (cópia legível, linha `H-n`).
- **Sem humano:** CI (`WORKFLOW_IA_CI=1`) ou `interacao.perguntarAoHumano=false` → relatório e encerrar. Se o humano não responder, o hook de parada libera e a decisão fica pendente para `/workflow-ia:retomar`.
- **Limites:** `interacao.maxDecisoes` por task; uma decisão pendente por vez; resposta consumida não se reaplica.

## Ajuste pós-entrega

Uma task CONCLUIDA volta a trabalhar quando o humano, testando, traz o que viu: `/workflow-ia:ajustar <ID> "<o que viu>"`. É a **mesma task** (mesma pasta), no **mesmo branch**, pelo **processo completo**, partindo do código atual do branch:

```
wf ajuste abrir ──► análise (spec-analyst: ajustes/A-n.md + .json) ──► wf ajuste registrar
  (arquiva a entrega n,        │
   ciclo novo de plano,        ├─ só correções ─────────────────────────────┐
   orçamento novo de rodadas)  └─ mudança ─► decisão AJUSTE_MUDA_SPEC ──────┤ (ajustar spec | tratar como correção | descartar)
                                                                            ▼
     plano (seção "Ajuste A-n", plan-reviewer) ─► testes de regressão + RED do ajuste ─► implementação
     ─► loop (1ª revisão completa desde a entrega n) ─► verificação (CA-n + cada ponto A-n.k) ─► entrega n+1
```

- **Entregas arquivadas:** `report.md` e `pr.md` vão para `relatorios/entrega-<n>-*.md`; `verificacao.json`, julgamento, manifest e o gate de verificação vão para `evidencias/entregas/<n>/`. As provas novas atestam o HEAD novo. `state.json` guarda `entregas[]`, `ajuste` (o atual) e `ajustes[]` (o histórico).
- **Só a pedido do humano:** o agente só reabre com o `/workflow-ia:ajustar <ID> <texto>` que o humano digitou (o hook `UserPromptSubmit` registra; a CLI confere o texto e o transcript e consome o pedido). No terminal, o humano roda `wf ajuste abrir` direto.
- **Spec só muda com o humano:** ponto de mudança (critério novo ou alterado) pede a decisão `AJUSTE_MUDA_SPEC`, sem veredito; o efeito "Ajustar o spec" autoriza um recongelamento (`wf spec aceitar-ajuste`), que só aceita o spec com os critérios aprovados exatamente como foram aprovados. A decisão fica amarrada ao ajuste e à análise que o humano viu (assinatura): cancelado o ajuste ou mudada a análise, ela é descartada sem efeito. Correção só cita CA-n existente. As decisões criadas pela CLI para um ajuste não contam em `interacao.maxDecisoes`; motivos de veredito `AJUSTE_*` são recusados.
- **Commit da entrega:** `entregas[].commit` é o commit que a entrega atestou (manifest/verificação); `commitReabertura` é o HEAD no `abrir`. A primeira revisão do ajuste usa `git diff <commit>..HEAD`, que inclui os commits do humano depois da entrega; se esse commit saiu do histórico do branch (rebase, force-push), a revisão volta a cobrir o branch contra a base.
- **RED do ajuste:** `evidencias/red-A-n.json`, sem `--aceitar-verde`. No `abrir`, o baseline anti-enfraquecimento passa a ser a fotografia dos testes **como foram entregues** (o baseline do RED anterior vai para `evidencias/entregas/<n>/`); o RED do ajuste compara com ela e a guarda em `evidencias/baseline-testes-entrega-<n>.json`. Enfraquecimento bloqueante só passa se o spec mudou com autorização. Sem pontos a provar (todos descartados depois de o código mudar), não há RED do ajuste.
- **Loop:** a verificação exige ao menos uma rodada de revisão do próprio ajuste; o item `revisao` do manifest conta só essas rodadas.
- **Verificação:** além dos CA-n, o verificador-final julga cada ponto `A-n.k`; ponto não atendido reprova e vira finding `verificacao:ajuste:A-n.k`. O manifest ganha os itens `ajuste` e `tdd:A-n`, que continuam nele quando é regenerado depois do veredito.
- **Recusas:** branch já contido na base ou com o conteúdo já nela (PR mergeado, inclusive por squash ou rebase: o ajuste vira card novo), fora do branch, working tree sujo, outra task ativa. `wf ajuste cancelar` desfaz antes de qualquer mudança (devolve a entrega anterior, o baseline, os limites e descarta a decisão pendente). `wf init-task` numa task CONCLUIDA exige `--nova-execucao`.

## Hosts e capacidades

O pipeline depende de dois pré-requisitos do host: os 13 subagentes e os hooks do plugin (atestam o `agent_type`). O F0 roda `wf ambiente` antes de criar a task; reprovado, a task nasce já BLOQUEADA com `AMBIENTE:` (`wf ambiente --bloquear`). Modos: nativo (Claude Code CLI, CI), host-provido (`wf exportar-agentes` + hooks por `plugins` ou pelo adaptador `scripts/host/hooks-sdk.mjs`) e recusa. Desenho, limites e alternativas descartadas: [portabilidade-hosts.md](portabilidade-hosts.md); contrato do RM Code: [hosts/rmcode.md](hosts/rmcode.md).

## Limitações conhecidas

- **Hooks são cercas, não sandbox.** Eles resolvem aliases e configurações do git, caminhos reais (symlinks, `..`, maiúsculas), `cd`, scripts do `package.json`, heredocs e SQL enviado por pipe, e procuram caminhos protegidos citados em código inline. Um script em arquivo que escreve no `state.json` por conta própria, ou um valor montado em tempo de execução, continua fora do alcance. O lock, o registro de tasks, o spec congelado e a verificação no commit limpo mitigam; a proteção do branch base no GitHub e o job de CI sem `contents: write` são a garantia final.
- **Autoria dos arquivos de subagente** (revisão do plano, julgamento da verificação, relatórios dos revisores) depende do campo `agent_type` que o Claude Code envia aos hooks quando a chamada vem de um subagente. Sem hooks ativos ninguém atesta isso; por isso o F0 recusa o host e a CLI não muda estado (para agentes) sem o batimento dos hooks. É uma cerca contra falha acidental de ambiente, não contra um orquestrador malicioso: a barreira final é o branch protegido no GitHub.
- **A medição de tokens lê o transcript do Claude Code**, cujo formato é interno e pode mudar. Se a leitura falhar, o consumo mostrado fica em 0. Como os tokens são só informativos, nada no pipeline depende deles; os limites de iterações, de progresso e (no CI) de USD do host continuam valendo.
- **A detecção de enfraquecimento de testes é estática** (contagem de asserts, skips e tags). Asserção trocada por outra mais fraca com a mesma contagem depende do test-reviewer e do verificador.
- **Integração com o board depende dos conectores MCP disponíveis na sessão.** Sem conector, o modo manual funciona com texto ou arquivo.
