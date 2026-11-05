# Portabilidade entre hosts

O Workflow IA roda onde duas coisas existem: **os 13 subagentes** (cada papel num contexto isolado) e **os hooks do plugin** (eles atestam *quem* está agindo e aplicam as cercas de git e de arquivos). Este documento explica por que, como o plugin descobre cedo se o host sustenta isso e o que ele faz quando não sustenta.

## O que falhou (2026-10-01)

`/workflow-ia:task` rodou no RM Code (app sobre o Claude Agent SDK) no `catalogo-assineyou` e terminou BLOQUEADA na F1 com `Agent type 'workflow-ia:spec-analyst' not found`. As skills e os comandos carregaram; os subagentes não. Os hooks também não rodaram: a pasta `.workflow-ia/runtime/` só tinha `registro-tasks.json`, sem `plugin-root` (gravado pelo SessionStart) nem `session.json` (gravado por qualquer hook). O `wf doctor` passou e a task foi criada antes de alguém saber que o host não sustentava o pipeline.

O desenho antigo dependia das duas coisas sem dizer. A identidade dos subagentes vem do `agent_type` do payload do hook (`donoDoArquivoDaTask` e `agenteEh` em `scripts/lib/core.mjs`); `plano-revisao.json`, `revisoes/iter-n/*.json`, `triagem.json` e `verificacao-julgamento.json` só podem ser gravados pelo subagente com o nome exato; `wf veredito CONCLUIDA` exige o registro do `verificador-final` em `runtime/subagentes.jsonl`. Num host sem agentes de plugin, nenhuma task pode concluir, e isso só aparecia no meio da execução.

## Quem mantém cada garantia

| Garantia | Mecanismo | Depende de |
|---|---|---|
| Revisão por especialistas em contexto isolado | Subagentes dos 13 papéis | Agentes registrados no host |
| Quem grava cada prova | `agent_type` atestado pelo hook (`guarda-arquivos`, `guarda-bash`) | Hooks ativos |
| Verificação independente | `verificador-final` registrado (`guarda-agentes`) antes do gate; só ele registra o julgamento | Agentes e hooks |
| Estado e provas só pela CLI | `guarda-arquivos` / `guarda-bash` | Hooks ativos |
| Git: sem commit/push em branch protegido, sem `--no-verify` | `guarda-bash` **e** git hooks `pre-commit`/`pre-push` | Hooks (1ª linha); `.git/hooks` (2ª linha) |
| Segredos | `gitleaks` no gate **e** no `pre-commit` | `gitleaks` instalado |
| Delegação na própria sessão (sem abrir sessões/abas do host) | `guarda-sessoes` nega `mcp__*__session_open`/`session_send` durante a task | Hooks ativos |
| Espera por subagente em segundo plano não conta como parada sem progresso | `guarda-agentes` (disparo) + `fim-subagente` (SubagentStop) + `gate-parada` | Hooks ativos **e** o evento `SubagentStop` (sem ele, cada disparo afrouxa o gate de parada até `limites.esperaSubagenteMin`) |
| Medição de tokens (informativa, sem teto) | `guarda-agentes` lê o transcript e a CLI mostra o consumo | Hooks ativos (sem eles, o consumo mostrado fica em 0; nada no pipeline depende disso) |
| Nada chega à base sem o humano | Branch protegido no GitHub | GitHub |

## Os modos

| Modo | Quando | Como as garantias se mantêm |
|---|---|---|
| **Nativo** | Claude Code CLI; CI (`WORKFLOW_IA_CI=1`, `claude -p` com o plugin) | Agentes `workflow-ia:*` e hooks do plugin. Nada mudou. |
| **Host-provido** | Host sobre o Agent SDK que registra os papéis e liga os hooks por conta própria (RM Code integrado) | `wf exportar-agentes` gera as definições (`agents` do `query()`) com os mesmos nomes; os hooks entram pela opção `plugins` do SDK ou pelo adaptador `scripts/host/hooks-sdk.mjs`. O `agent_type` continua atestado pelo hook, então as mesmas travas valem. Contrato em [hosts/rmcode.md](hosts/rmcode.md). |
| **Recusa no F0** | Qualquer host sem os 13 papéis ou sem hooks vivos | `wf ambiente` reprova (`AMBIENTE: ...`, código 5); a task **não nasce**. |

Os dois primeiros são o mesmo contrato visto de ângulos diferentes: *os 13 nomes existem e os hooks atestam o `agent_type`*. A diferença é só quem registra (o plugin ou o host).

## O F0

1. O orquestrador lista os tipos de subagente que vê na ferramenta de agentes e roda `wf ambiente --agentes-visiveis <lista>` (ou o host entrega o dump do `system:init` com `--sdk-init arquivo.json`).
2. `wf ambiente` verifica:
   - **hooks**: o hook `PreToolUse(Bash)` carimba `runtime/heartbeat-bash.json` a cada comando; como todo `wf` roda via Bash, o hook da própria chamada acabou de carimbar. O carimbo precisa ter no máximo `host.janelaBatimentoSegundos` (120 s);
   - **agentes**: os 13 papéis casam pelo sufixo (`workflow-ia:spec-analyst` = nativo; `spec-analyst` = host-provido);
   - erros de carga de plugin (`plugin_errors` do `--sdk-init`).
3. Resultado em `runtime/ambiente.json` (`modo`, `hooks`, `agentes`, `tipos`, `faltando`, `instrucoes`). Reprovado: sai com código 5 e `AMBIENTE: ...`.
4. `wf init-task` só cria a task (para chamadores agente) com um `ambiente.json` aprovado há até 10 min e hooks vivos agora. Reprovado, o orquestrador usa `wf ambiente --bloquear <ID>`: a task nasce já **BLOQUEADA** (`AMBIENTE: ...`), na fase `entrega`, sem passar pela F1; ele escreve o `report.md` com as `instrucoes` e roda `wf encerrar`.
5. O orquestrador usa em toda delegação o `subagent_type` de `tipos.<papel>`, não um nome fixo.

O `wf doctor` ganha a seção `host`. Para um humano no terminal ela é informativa; dentro de um agente (Claude Code, SDK, CI), hook inativo reprova o doctor.

## Segunda linha de defesa (sem depender só dos hooks)

- **A CLI recusa mudar estado sem hooks vivos** (para chamadores agente): `fase`, `meta`, `red`, `gate`, `iteracao`, `findings`, `verificar-limpo`, `verificacao`, `manifest`, `veredito CONCLUIDA`, `encerrar` com veredito positivo. Sai com `AMBIENTE:` e código 5. Fechar a task de forma negativa (`veredito BLOQUEADA|INTERROMPIDA` e o `encerrar` correspondente) continua possível sem hooks: é assim que um host sem hooks termina com motivo claro, sem conceder prova nenhuma.
- **Git hooks gerenciados** (`pre-commit`, `pre-push`), instalados por `instalar.mjs`: bloqueiam commit e push em branch protegido quando o chamador é um agente (`CLAUDECODE`/`CLAUDE_CODE_*`/`WORKFLOW_IA_CI`) ou há uma task em execução, e rodam `gitleaks` no que vai ser commitado. O humano no terminal, sem task, não é afetado. Respeitam `core.hooksPath` (husky) e nunca sobrescrevem hook alheio.
- `verificadorRegistrado` e `donoDoArquivoDaTask` continuam exigindo o registro do `verificador-final` e o dono de cada arquivo de prova.

## Limites (leia antes de confiar)

- **São cercas, não sandbox.** Já era assim com o `guarda-bash`. O batimento de hooks protege contra falha **acidental** de ambiente, que foi o que aconteceu. Um orquestrador deliberadamente malicioso, num host sem hooks, poderia forjar arquivos de `runtime/`; o que continua de pé é o branch protegido no GitHub e o job de CI sem `contents: write`.
- **A decisão humana confia no host para fazer a pergunta.** Os hooks garantem que o agente não pré-preenche nem troca as perguntas e a CLI confere a resposta no transcript; mas, num host cujo `canUseTool` responde o AskUserQuestion sozinho, a "resposta do humano" é do host. Veja [hosts/rmcode.md](hosts/rmcode.md).
- **A lista de agentes visíveis é autodeclarada.** Ela existe para falhar cedo e com mensagem clara, não como prova de segurança. A prova é o hook que atesta o `agent_type` de cada gravação.
- **Git hooks vivem em `.git/hooks`** e não são versionados; cada clone precisa rodar o instalador (`--atualizar` renova).

## O que foi avaliado e descartado

| Alternativa | Por que não |
|---|---|
| **Modo por papel**: o orquestrador chama `wf papel abrir <papel>`, recebe uma credencial de uso único (ligada à task, fase, iteração e HEAD) e a repassa a um subagente genérico, que grava as provas com `wf revisao gravar --credencial ...` | A credencial **passa pelo contexto do orquestrador**: ele pode usá-la antes do subagente, e a CLI não tem como provar *quem* a apresenta sem um canal de identidade do host, que são justamente os hooks. Sem hooks, qualquer esquema de credencial é teatro; com hooks, o modo host-provido já dá identidade mais forte (`agent_type`). Por isso não foi implementado (e não há atalho). As variantes de fraude "credencial reutilizada, de outra task ou de outro HEAD" não existem porque o mecanismo não existe; as fraudes que existem (orquestrador gravando prova de revisor, agente genérico, revisor de outra área, registro do verificador por quem não é ele) estão cobertas em `testes/host.sh`. |
| `wf papel executar`: a CLI abre o papel num `claude -p` filho, com a credencial só no ambiente dele | Seguro contra deriva do LLM, mas exige o binário `claude` no PATH do host, não mede os tokens do filho no consumo da task e só é testável com um `claude` falso. Escopo e risco maiores que o ganho: o modo host-provido cobre o mesmo caso. |
| Credencial amarrada ao `agent_id` pelo hook | Só vale com hooks ativos, e então registrar os agentes (modo host-provido) resolve com identidade mais forte. Complexidade sem ganho. |
| Orquestrador gravando as provas dos revisores ("modo sem revisão") ou usando `general-purpose` no lugar de um papel | Anula a revisão e a verificação independentes. Proibido pela regra 10/11 do orquestrador e negado pelos hooks. |
| Confiar na lista de agentes autodeclarada como segurança | É UX de falha cedo; a segurança vem do hook. |
| Tornar `wf doctor` o portão | O doctor roda no terminal do humano, onde não há hooks nem lista de agentes; o portão é `wf ambiente` + `init-task`. |

## Matriz de hosts

Veja a matriz "Hosts suportados" no [README](../README.md#hosts-suportados) e no [INSTALL](../INSTALL.md#hosts-suportados).
