# Workflow IA

Plugin do Claude Code que transforma um card do board num **branch pronto, com provas**. O agente recebe o card e executa sozinho o fluxo de um time profissional:

1. extrai o spec;
2. planeja;
3. escreve os testes primeiro;
4. implementa;
5. passa por revisão de especialistas (segurança, performance, qualidade e testes; operação e LGPD quando o diff pede);
6. corrige num loop com limite de custo;
7. entrega um pacote de provas conferido por um verificador independente.

**Abrir o PR e fazer o merge continuam sendo seus.** Os hooks bloqueiam as duas coisas na sessão; no CI, o job do agente roda com token só de leitura do código, e o branch é publicado por um job separado que recusa a base. Proteja o branch base no GitHub: é a garantia final.

```
 card no board ──► /workflow-ia:task VST-123
        │
  F0 Intake ─ F1 Spec (CA-n em Gherkin) ─ F2 Plano (+ revisão adversarial)
        │
  F3 Branch ─ F4 Testes primeiro (RED provado) ─ F5 Implementação
        │
  ┌──────────── loop (até 5 rodadas de code review) ───────────────┐
  │ gate determinístico (até verde) → 4 revisores (+ ops) →        │
  │ triagem → correção (urgente → alto → médio)                    │
  └────────────────────────────────────────────────────────────────┘
        │
  Verificação independente (checkout limpo, relê o card original)
        │
  ✅ CONCLUÍDA  |  ⛔ BLOQUEADA  |  ⏸️ INTERROMPIDA   + report.md + pr.md
                      │               │
                      └── o agente te pergunta (AskUserQuestion), aplica a sua
                          resposta e a MESMA task continua de onde parou
```

**Quando algo depende de você** (regra de negócio indefinida, plano reprovado três vezes, limite de rodadas de revisão, gate travado, ambiente), o agente da sessão te faz as perguntas, com as opções e a recomendação dele. Você responde ali mesmo, no chat, e a task continua na fase em que parou, sem refazer spec, plano ou testes. Se você não estiver lá (CI, ou não respondeu), a task fecha com o relatório; depois é só rodar `/workflow-ia:retomar <ID>`. A resposta só vale se vier de você: os hooks registram o que você escolheu e a CLI confere no transcript da sessão, então o agente não consegue se desbloquear sozinho.

**Depois da entrega, testando, você viu algo para mudar?** `/workflow-ia:ajustar <ID> "<o que você viu>"`. A mesma task volta, na mesma pasta e no mesmo branch, e o ajuste passa pelo processo completo a partir do código atual: análise documentada em `ajustes/A-n.md`, plano, testes de regressão (RED), implementação, revisão, verificação de cada ponto e nova entrega com o histórico das anteriores. Se o ajuste muda um critério de aceite, o agente pergunta antes.

## O que vem no plugin

| Tipo | Quantidade | Itens |
|---|---|---|
| Skills de orquestração | 10 | `orquestrador-task`, `extracao-specs`, `politica-autonomia`, `roteamento-skills`, `triagem-findings`, `pacote-provas`, `entrega-relatorio`, `integracao-board`, `instalacao-projeto`, `atualizacao-projeto` |
| Skills de domínio | 16 | `stack-e-convencoes`, `arquitetura-design`, `frontend-engenharia`, `frontend-performance`, `frontend-seguranca`, `acessibilidade-ux`, `backend-engenharia`, `backend-seguranca`, `backend-performance`, `api-design-integracoes`, `banco-modelagem`, `banco-performance`, `banco-seguranca-operacao`, `testes-qualidade`, `auditoria-seguranca-pentest`, `devops-observabilidade-lgpd` |
| Subagentes | 13 | `spec-analyst`, `arquiteto`, `plan-reviewer`, `test-writer`, `implementer`, `security-reviewer`, `performance-reviewer`, `quality-reviewer`, `test-reviewer`, `ops-reviewer` (condicional), `triager`, `fixer`, `verificador-final` |
| Comandos | 10 | `/workflow-ia:task`, `:spec`, `:revisar`, `:status`, `:pausar`, `:retomar` (pausa, sessão interrompida ou decisão humana), `:ajustar`, `:instalar`, `:atualizar`, `:doctor` |
| Hooks | 6 eventos | SessionStart, PreToolUse (Bash, arquivos, subagentes, sessões novas, perguntas ao humano), PostToolUse (edições, respostas do humano), SubagentStop, UserPromptSubmit, Stop |
| CLI `wf` | — | Estado, gate, findings, loop, provas e veredito, mais `ambiente` (capacidades do host) e `exportar-agentes`, sem dependências |

## Instalação

Veja o [INSTALL.md](INSTALL.md), escrito para que você possa simplesmente pedir a um agente: *"instale o Workflow IA neste projeto"*. Em resumo:

```bash
claude plugin marketplace add ~/Code/workflow-ia     # uma vez por máquina
claude plugin install workflow-ia@fabriki
# dentro do projeto, no Claude Code:
/workflow-ia:instalar
```

## Hosts suportados

O mesmo `/workflow-ia:task` roda em hosts diferentes, **sem enfraquecer nenhuma garantia**: revisão por especialistas em contexto isolado, verificação independente, arquivos de prova protegidos, guardas de git e de arquivos. Onde uma garantia não pode ser mantida, o sistema **falha cedo e com mensagem clara**, no F0 (`wf ambiente`), antes de criar a task. As garantias dependem de duas coisas: os **13 subagentes** e os **hooks do plugin** (eles atestam quem grava cada prova).

| | Claude Code CLI | RM Code / Agent SDK | CI (`WORKFLOW_IA_CI=1`) |
|---|---|---|---|
| Skills e comandos `/workflow-ia:*` | sim | sim | sim |
| Subagentes dos 13 papéis | sim (`workflow-ia:*`) | **só depois da integração** (hoje não carregam) | sim (`claude -p` com o plugin) |
| Hooks do plugin (guardas, identidade, medição de tokens) | sim | **só depois da integração** (hoje não rodam) | sim |
| Git hooks `pre-commit`/`pre-push` | sim, se o instalador rodou | sim, se o instalador rodou | sim, se o instalador rodou |
| `wf ambiente` | `nativo` | antes: **bloqueado** (`AMBIENTE:`); depois: `nativo` ou `host-provido` | `nativo` |
| Task começa? | sim | só com os dois itens acima; senão **BLOQUEADA no F0** com a instrução de como resolver | sim |
| Como ativar | `claude plugin install workflow-ia@fabriki` e uma sessão nova | [docs/hosts/rmcode.md](docs/hosts/rmcode.md): `plugins:[{type:'local'}]` no `query()` (ou `wf exportar-agentes` + adaptador de hooks) e a conta com o plugin habilitado | `instalar.mjs --ci`; veja [docs/ci-headless.md](docs/ci-headless.md) |

Comandos relacionados: `wf ambiente`, `wf doctor` (seção `host`), `wf exportar-agentes`. O desenho completo, os limites e o que foi descartado (por exemplo, por que **não** existe um "modo por papel" com credencial) estão em [docs/portabilidade-hosts.md](docs/portabilidade-hosts.md).

## Atualizar um projeto que já usa o Workflow IA

```
/workflow-ia:atualizar
```

Confere as versões, atualiza o plugin se estiver atrás, roda `instalar.mjs --atualizar` (primeiro `--simular`, com o diff do config), **preserva os valores que você ajustou** (ex.: um `build` com variáveis de ambiente), aplica as migrações do schema do config (`versao` 1 → 2 ...), renova o atalho `wf`, a seção do `CLAUDE.md`, o `.gitignore` e os git hooks, e confere com `wf doctor`. Nunca faz commit.

## Como a "habilidade certa no momento certo" é garantida

Não depende de o agente lembrar:

- **O plano declara as skills de cada etapa** (`Skills:` no `plan.md`, pela matriz de `roteamento-skills`). O implementer carrega exatamente essas.
- **Cada subagente pré-carrega as skills do seu papel.** O `security-reviewer` nasce com as quatro skills de segurança; o `performance-reviewer`, com as três de performance; o `ops-reviewer`, com a de operação e LGPD.
- **Cada finding carrega a skill da correção.** O fixer carrega a skill indicada antes de corrigir.
- **A máquina de estados diz o próximo passo** (`wf proximo`), inclusive quais revisores rodam em cada rodada.

## Por que dá para confiar no "está feita"

- **O estado e as provas só mudam pela CLI.** Os hooks bloqueiam edição direta de `state.json`, `findings.json`, `verificacao.json`, `manifest.json` e `evidencias/`.
- **O TDD é provado:** `wf red` exige que os testes falhem na asserção num commit antes da implementação e tira uma fotografia dos testes (baseline). Ele roda só os arquivos de teste que a task criou ou alterou (`wf red --completo` roda as suítes inteiras).
- **Enfraquecer testes é detectado:** remoção de arquivo, `skip`/`only` novo, tag `[CA-n]` perdida ou queda de asserts em relação ao baseline.
- **A verificação independente** roda o gate completo (todas as etapas, sem cache e sem falhar rápido) com a árvore de trabalho limpa, no commit final. O verificador relê o card original e confirma cada correção olhando o código.
- **`wf veredito CONCLUIDA` recusa** enquanto houver item faltando na Definition of Done (`wf manifest`).
- **O hook de parada** não deixa o agente encerrar a sessão no meio da task. Depois de alguns bloqueios sem progresso, ele libera e registra um alerta, para não virar loop infinito.

## Limites do loop

Uma iteração é **uma rodada de code review**: no máximo 5, para P, M e G. Dentro dela, o gate e os revisores começam **juntos** (os revisores só leem o diff) e a triagem espera os dois terminarem, juntando os findings da revisão com as falhas do gate; com o gate vermelho, a rodada conta do mesmo jeito e o fixer corrige tudo numa passada só. Na 1ª rodada os 4 fixos (segurança, performance, qualidade, testes), mais o de operação/LGPD (`ops-reviewer`) quando o diff toca migration, ambiente, CI, container, logs, jobs, webhooks ou health, ou o spec marca dados pessoais. Médios são corrigidos no loop como os bloqueantes; o loop vai para a verificação quando só sobram baixos, que ficam no relatório.

O loop para (INTERROMPIDA, e o agente te pergunta como seguir) quando:
- as 5 rodadas acabam com bloqueantes ou médios abertos (opções: +1 ou +2 rodadas, ou encerrar). A volta de uma verificação reprovada conta como uma das 5;
- o número de bloqueantes não cai em 2 rodadas seguidas (sem progresso);
- o mesmo finding de revisão é corrigido e reaberto 3 vezes (oscilação);
- a mesma etapa do gate falha 5 vezes seguidas (gate travado; opções: mais 5 tentativas ou encerrar).

O plano tem até 3 rodadas do plan-reviewer antes de parar com `PLANO_REPROVADO`.

Não há orçamento de tokens: o consumo é medido no transcript da sessão (input + cache de escrita + output + 10% da leitura de cache) e aparece em `wf status`, `wf tokens` e no relatório, só como informação. No CI, `--max-budget-usd` é um teto de custo do Claude Code, à parte. Os limites ficam em `.workflow-ia/config.json`, seção `limites`.

## Gate incremental no loop

Dentro do loop, o `wf gate` não refaz o que já passou e não mudou. Cada etapa do gate pode declarar no config os seus **insumos** (globs: código e testes do app, `prisma/`, `tsconfig*`, `e2e/`…). Uma etapa que passou é reaproveitada na rodada seguinte ("ok (cache, iteração N)") quando nenhum insumo dela mudou; as que falharam e as afetadas pelo diff da correção rodam de novo. Num monorepo, divida a etapa por app (`teste-e2e:pdv-web`, `teste-e2e:pdv-api`) para que uma correção no `pdv-api` não rode o e2e do `pdv-web`.

- **Sem insumos declarados, a etapa sempre roda.** Um config sem mapeamento se comporta como antes.
- **A prova não enfraquece.** O cache só é aceito se o commit dele é ancestral do HEAD, se nenhum insumo mudou entre os dois e se o hash dos insumos confere. Rebase, merge de base nova e mudança de config, lockfile ou insumo global invalidam tudo. Uma falha registrada fora do cache (finding do gate aberto, gate com rótulo, verificação) força a etapa a rodar. Etapas que dependem do histórico (`segredos`, `{base}` no comando, `cacheavel: false`) nunca vêm do cache. Insumos que não casam nenhum arquivo fazem a etapa rodar, e o doctor avisa. Arquivos ignorados pelo git que casam os insumos (código gerado, `.env`) entram na impressão digital; diretórios ignorados inteiros (`node_modules/`) não entram.
- **A verificação final não usa cache.** `wf verificar-limpo` roda o gate completo em checkout limpo, e o manifest recusa etapa reaproveitada nessa prova.
- **Transparência.** A saída do `wf gate` mostra a tabela "etapa | rodou ou cache | duração | motivo", e o relatório final soma o tempo economizado.
- `wf gate --sem-cache` roda tudo; `wf gate --so-falhas` roda só as que falharam e as invalidadas pelo diff; `wf gate --etapas teste-e2e` roda só a etapa pedida. Os dois últimos contam como gate da iteração quando o cache cobre o resto. `gate.cacheEntreIteracoes: false` desliga o cache no projeto.
- **O que falta.** Com o gate da iteração vermelho, `wf proximo` e `wf status` listam as etapas pendentes e o motivo ("teste-e2e — falhou (por carga) às 18:10; typecheck — insumos mudaram em abc1234 (apps/a/x.ts)") e sugerem o `wf gate --etapas` que fecha a iteração.
- **`{app}` nos insumos.** Em `teste-e2e:pdv-web`, `apps/{app}/**` vale `apps/pdv-web/**`; `gate.insumosPadrao` (opcional) dá os mesmos globs a todas as sub-etapas de um grupo.

Detalhes e exemplo de monorepo em [docs/configuracao.md](docs/configuracao.md#gate).

## Desempenho do loop

Feito para monorepos com suítes longas e várias tasks na mesma máquina. Num config antigo tudo começa desligado e o gate fica igual; uma instalação nova já liga o que não depende da máquina. A verificação final continua rodando tudo.

- **Falhar rápido por custo** (`gate.falharRapido`, `custo` por etapa): o gate roda em ondas (baixo → medio → alto). Se uma etapa obrigatória falha, as ondas seguintes ficam "não executada (falha anterior em typecheck)" na prova, sem gastar 40 min de integração num typecheck vermelho. Etapas não obrigatórias (sast, dependências) nunca cortam ondas.
- **Teto por etapa e repetição por carga** (`timeoutSegundos` na etapa, `gate.repetirPorCarga`): falha de máquina (timeout, porta ocupada, memória, banco recusando conexão, processo morto) repete só aquela etapa, e as tentativas ficam na prova. Falha de asserção nunca é repetida.
- **Paralelismo** (`gate.paralelismo`): etapas da mesma onda rodam juntas. Etapas pesadas rodam uma de cada vez, e `paralela: false` roda sozinha.
- **Vagas de recurso** (`recursos.vagasPesadas`, `pesada: true` na etapa): várias tasks na mesma máquina disputam N vagas numa fila justa, por ordem de chegada. A vaga fica com a task até o fim do gate, e um processo morto (kill -9) libera a vaga sem corrida: quem a recupera relê o dono sob uma trava e mata as etapas que o morto deixou rodando. A etapa recebe `WF_VAGA=N` (ex.: banco de teste N). `wf vagas` mostra quem está em cada vaga; `wf aguardar-vaga` espera a vez sem polling e reserva a vez da task para o gate seguinte (`recursos.reservaSegundos`). Etapa obrigatória sem vaga não conta como o gate da iteração.
- **Dependências entre etapas** (`dependeDe` na etapa): `typecheck`, `build:*` e `teste-e2e:*` podem depender da `teste-ci` (suíte delegada ao CI). Se ela falhar, as dependentes ficam "pulada (dependência: teste-ci falhou)": não pegam vaga, não rodam, e o gate (inclusive a verificação final) reprova logo. Pulada nunca conta como aprovada. O `wf doctor` recusa nome inexistente, ciclo e autodependência.
- **`wf red` focado:** só os testes da task (`comandos.testeArquivos`/`testeArquivo`), com o mesmo critério: cada falha tem de ser de asserção. Ligado na instalação nova (`provas.redFocado`); um config migrado continua com o RED completo.
- **`wf checar <arquivos>`:** o fixer valida a correção com o lint dos arquivos, o typecheck do app e os testes relacionados antes de gastar um gate. Não é prova.
- **Base por task:** `wf init-task <ID> --base feat/x` faz diff, gate (`{base}` e `WF_BASE`), RED e revisores compararem com `origin/feat/x`. `wf base <branch> --motivo "..."` troca a base (registrado em `decisoes.md`). Uma base que contém os commits da própria task é recusada.
- **Heartbeat durante comandos longos:** enquanto `gate`, `red`, `verificar-limpo`, `checar` ou `aguardar-vaga` rodam, a própria CLI renova o batimento dos hooks, mas só se ele estava válido no início, e só para o mesmo shell ou a mesma sessão. Um batimento vencido há pouco pede para repetir o comando, e não é motivo para BLOQUEADA. Um carimbo antigo ou de outra sessão é AMBIENTE.
- **Commit testado é o do início:** se o HEAD mudar enquanto o gate (ou o RED, ou a verificação) roda, o resultado é inválido e não conta.

## Modo CI (opcional, 0.7.0)

Desligado por padrão. Ligado pelo humano (`ci.ativo`), a verificação final delega ao GitHub Actions as etapas pesadas e usa o resultado do run como prova; RED, implementação e loop continuam na máquina.

| Etapa | Onde |
|---|---|
| `teste-integracao`, `teste-unitario`, `build` | CI |
| `typecheck` | CI na verificação (1º job; corta os testes se não compila), local nas outras fases |
| `teste-e2e` | local (CI só com `ci.e2e`) |
| `lint`, `sast`, `dependencias` | local |
| `segredos` | sempre local, **antes do push** |

- **Como ativar:** `wf ci gerar` escreve a proposta do workflow em `.workflow-ia/ci/` (yml, patch do config e LEIA-ME); o humano copia o yml para `.github/workflows/`, aplica o patch (`wf ci ativar --aplicar`, fora do Claude Code), exige o check `ci-ok` na proteção do branch e confere `gh auth status`. O plugin nunca escreve em `.github/workflows/` nem faz force push.
- **Como funciona:** a etapa sintética `teste-ci` roda `segredos` local, faz push do branch da task, dispara o workflow com os apps alterados e espera o run do mesmo SHA. Job pulado ou cancelado de app alterado reprova. O verificador só aceita a prova do CI com o SHA do commit verificado.
- **CI econômico (0.8.0):** o mesmo commit não roda duas vezes. Um run verde do mesmo SHA (o disparo da verificação, ou a PR cujo merge tem a mesma árvore do commit) é reaproveitado sem push nem disparo; um run em andamento é anexado; um run que falhou numa verificação anterior repete só os jobs que falharam (`gh run rerun --failed`, no máximo `ci.repetirFalhas` vez por commit); falta de cobertura dispara só os apps que faltam. `WF_GATE_CI_NOVO=1` força um run novo. No run da PR, o job `reaproveitar` do yml gerado pula os jobs de app quando a verificação do mesmo head SHA já os aprovou. Base desatualizada só gera aviso.
- **Reaproveitamento por conteúdo (0.9.0, `ci.criterioReaproveitar: "conteudo"`):** com a base andando a cada merge, o run da PR deixava de reaproveitar a verificação e rodava todos os apps de novo. Agora a decisão é **por app**: o `workflow_dispatch` verde mais novo da mesma branch prova o app quando o hash do conteúdo dele (`git ls-tree` de `dir` + `compartilhado` + `entradas` + lockfiles da raiz) e o do workflow são iguais no commit do dispatch e no commit testado. Vale no job `reaproveitar` da PR (um booleano por app; o `ci-ok` só aceita o pulo do app com prova) e na verificação (um commit posterior só de docs não pede nova verificação; o commit que toca um app dispara só esse app). Instalação nova liga; config migrado fica em `"commit"` (0.8.0) até o humano trocar. App que lê arquivo fora da pasta declara em `ci.apps.<app>.entradas`.
- **Custo:** a soma das durações dos jobs em minutos do Actions por verificação; shards dividem a suíte, não o total.
- **Erros:** `CI-ESTADO` (repositório ou config não permitem: commit, `git pull --ff-only`, `wf doctor`) e `CI-INDISPONIVEL` (gh, rede, cota, workflow, timeout: não é defeito do código, não abre finding; repita ou `WF_GATE_CI_FALLBACK=local`). `WF_GATE_CI=1` força o CI em qualquer fase.

## Documentação

- [INSTALL.md](INSTALL.md): instalação passo a passo, para humanos e agentes.
- [docs/arquitetura.md](docs/arquitetura.md): pipeline, fases, loop, provas e hooks em detalhe.
- [docs/configuracao.md](docs/configuracao.md): referência do `config.json` e da CLI `wf`.
- [docs/ci-headless.md](docs/ci-headless.md): execução autônoma no GitHub Actions disparada pelo board.
- [docs/portabilidade-hosts.md](docs/portabilidade-hosts.md): hosts suportados, modos (nativo, host-provido, recusa no F0), segunda linha de defesa e alternativas descartadas.
- [docs/hosts/rmcode.md](docs/hosts/rmcode.md): contrato de integração do RM Code (e de qualquer app sobre o Claude Agent SDK).

## Testes do próprio plugin

```bash
bash testes/run.sh
```

O script cria um projeto git temporário e percorre o pipeline inteiro pela CLI:
- RED, loop, correção e re-revisão;
- dívida técnica;
- verificação reprovada e depois aprovada;
- manifest e veredito;
- testes enfraquecidos.

Também testa as cercas dos hooks: git/PR, segredos, estado, banco e parada.

O `run.sh` roda ao fim as suítes `testes/host.sh` (detecção de host, recusa no F0, exportação de agentes, adaptador de hooks, fraudes de identidade, git hooks) e `testes/atualizacao.sh` (migrações do config, `--atualizar`, recusas e CI). As suítes são herméticas: nada do ambiente de quem roda (variáveis `CLAUDE*`, `semgrep`/`gitleaks` instalados) muda o resultado.

## Requisitos

- Claude Code com suporte a plugins.
- Node.js 18+.
- git.
- No projeto: comandos de typecheck, lint, testes e build. Recomendados: `gitleaks` e `semgrep`.
- Stack de referência das skills: Next.js, TypeScript, Node/Express, Prisma e PostgreSQL. Os princípios valem para outros stacks.
