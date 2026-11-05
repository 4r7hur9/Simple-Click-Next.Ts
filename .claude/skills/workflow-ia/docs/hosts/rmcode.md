# Contrato de integração: RM Code (e qualquer app sobre o Claude Agent SDK)

Este documento é a especificação para o **host** (o RM Code, ou outro app que use `@anthropic-ai/claude-agent-sdk`) fazer o Workflow IA funcionar por inteiro: skills, comandos, **os 13 subagentes** e **os hooks**. O plugin não edita o host; ele recusa a task no F0 enquanto isto não estiver feito.

Referências consultadas em 2026-10-01 (documentação atual do Agent SDK, `code.claude.com/docs/en/agent-sdk/{plugins,subagents,hooks}`) e o `sdk.d.ts` do `@anthropic-ai/claude-agent-sdk` 0.3.284 instalado no RM Code.

## Diagnóstico do que existe hoje

Lendo `rm-code/src/main/services/agent.ts` (a chamada `query()` por volta das linhas 897–934), o RM Code passa ao SDK `cwd`, `permissionMode`, `env`, `model`, `resume`, `mcpServers`, `skills`, `systemPrompt`, `includePartialMessages` e `canUseTool`. **Não passa `plugins`, `agents`, `hooks` nem `settingSources`.** O plugin chega ao processo só pelo `enabledPlugins` do perfil da conta (`CLAUDE_CONFIG_DIR`):

| Conta | Perfil | `workflow-ia@fabriki` |
|---|---|---|
| `claude-1` | `~/.claude` | habilitado |
| `claude-2` | `~/Library/Application Support/rm-code/agent-home/claude-2` | **não habilitado** (nem instalado nesse perfil) |

Efeito observado na task `LOCAL-20261001-data-competencia-pedidos`: skills e comandos apareceram; `Agent type 'workflow-ia:spec-analyst' not found`; nenhum hook rodou. A causa exata de os agentes e hooks do `workflow-ia` não carregarem numa sessão da conta 1 **não é provável só por leitura do código** (outros plugins, como `codex` e `vercel`, expõem agentes no RM Code). O `system:init` do SDK resolve isso: ele lista `plugins`, `plugin_errors` e `agents`. Faça o dump dele (abaixo) e rode `wf ambiente --sdk-init`.

## O que o SDK documenta

- `options.plugins: [{ type: 'local', path }]` carrega do diretório do plugin **skills, comandos, agentes (`agents/`), hooks (`hooks/hooks.json`) e MCP**. O caminho precisa ser **absoluto** (o SDK não expande `~`) e apontar para a raiz do plugin (o pai de `skills/`, `agents/`, `hooks/`, `.claude-plugin/`). Um caminho inexistente é ignorado sem erro: confira o `system:init`.
- `options.agents: Record<string, AgentDefinition>` registra subagentes programaticamente (`description`, `prompt`, `tools`, `model`, `skills`, ...). Eles têm precedência sobre os de arquivo com o mesmo nome. A ferramenta de agentes se chama `Agent` (aparece como `Task` na lista de ferramentas do `init` e em SDKs antigos).
- `options.hooks`: callbacks `(input, toolUseID, { signal }) => Promise<HookJSONOutput>` por evento. O plugin usa `SessionStart`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit` e `Stop` (todos existem no SDK TypeScript). `agent_id` e `agent_type` vêm preenchidos **dentro de subagentes**, que é o que o plugin usa para atestar quem grava cada prova. A saída tem o mesmo JSON dos hooks de comando (`hookSpecificOutput.permissionDecision`, `decision: 'block'`, `additionalContext`).
- O `env` do TypeScript **substitui** o ambiente do subprocesso (o RM Code já parte de `process.env`).

## Opção A (recomendada): carregar o plugin pelo SDK

É o caminho de menor manutenção: agentes (`workflow-ia:*`), hooks, skills e comandos vêm juntos, com os nomes de sempre. Resolva o caminho instalado no perfil da conta e passe em `plugins`.

```ts
import { query } from '@anthropic-ai/claude-agent-sdk'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// installed_plugins.json do perfil da conta: { plugins: { "workflow-ia@fabriki": [{ installPath, version }] } }
function caminhoDoWorkflowIA(homeDaConta: string): string | null {
  try {
    const dados = JSON.parse(readFileSync(join(homeDaConta, 'plugins', 'installed_plugins.json'), 'utf8'))
    return dados.plugins?.['workflow-ia@fabriki']?.[0]?.installPath ?? null // caminho absoluto
  } catch {
    return null
  }
}

const pluginWorkflowIA = caminhoDoWorkflowIA(process.env.CLAUDE_CONFIG_DIR!)

const q = query({
  prompt,
  options: {
    cwd: workspace,
    // ...o que o RM Code já passa (env, model, mcpServers, canUseTool, ...)
    plugins: pluginWorkflowIA ? [{ type: 'local', path: pluginWorkflowIA }] : [],
    // O orquestrador delega pela ferramenta Agent: sem isto cada subagente pede permissão
    allowedTools: ['Agent'],
  },
})
```

Não registre `agents` nem `hooks` **além** disso: os do plugin já vêm, e duplicar faria os hooks rodarem duas vezes.

### Perguntas ao humano (decisão humana)

Numa parada (BLOQUEADA/INTERROMPIDA) o orquestrador pergunta ao humano pela ferramenta `AskUserQuestion` e a task continua com a resposta. No SDK, a pergunta chega ao host pelo `canUseTool` (`toolName === 'AskUserQuestion'`) e a resposta volta em `updatedInput.answers`. O contrato:

- o `canUseTool` **deve** mostrar as perguntas ao usuário e devolver o que **ele** escolheu (`{ behavior: 'allow', updatedInput: { questions: input.questions, answers } }`). Responder sozinho (regra automática, modo "aceitar tudo") anula a decisão humana: o plugin não consegue distinguir isso;
- inclua `AskUserQuestion` em `allowedTools`/`tools` se o host restringir a lista;
- os hooks `PreToolUse`/`PostToolUse` com matcher `AskUserQuestion` e o `UserPromptSubmit` vêm do `hooks/hooks.json` do plugin (Opção A) ou do adaptador (Opção B), sem código extra;
- a CLI confere a resposta também no transcript da sessão (`transcript_path`); se o host não persistir sessões, ajuste `interacao.exigirTranscript` e documente o motivo.

Sem `AskUserQuestion` no host, o orquestrador mostra as perguntas no chat e o usuário responde `H-n: <opção>`; o `UserPromptSubmit` registra a mensagem.

## Opção B: o host registra os agentes e liga os hooks

Quando o host não quer (ou não pode) carregar o plugin inteiro, ele registra os 13 papéis e os hooks por conta própria. É o **modo host-provido**.

### B1. Agentes: `wf exportar-agentes`

```bash
node <plugin>/scripts/wf.mjs exportar-agentes --formato sdk > agentes-workflow-ia.json    # JSON
node <plugin>/scripts/wf.mjs exportar-agentes --formato mjs --saida agentes.mjs           # módulo ESM
node <plugin>/scripts/wf.mjs exportar-agentes --prefixo ''                               # nomes puros, sem "workflow-ia:"
```

Cada chave é `<prefixo><papel>` (padrão `workflow-ia:`) com `{ description, prompt, tools, model, skills }`, os mesmos campos dos `agents/*.md`. O prefixo padrão mantém o `subagent_type` igual ao do plugin; se o SDK recusar `:` numa chave, use `--prefixo ''` (o orquestrador usa o nome que `wf ambiente` resolver, então os dois funcionam).

### B2. Hooks: o adaptador de callbacks

`scripts/host/hooks-sdk.mjs` lê `hooks/hooks.json` do plugin e devolve os callbacks que executam os mesmos scripts (`inicio-sessao`, `guarda-bash`, `guarda-arquivos`, `guarda-agentes`, `guarda-sessoes`, `guarda-perguntas`, `pos-edicao`, `registrar-resposta`, `fim-subagente`, `gate-parada`) com o payload no stdin.

```ts
import { query } from '@anthropic-ai/claude-agent-sdk'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const pluginRoot = '/caminho/absoluto/do/plugin/workflow-ia' // ex.: o installPath do instalado, ou ~/Code/workflow-ia expandido
const agents = JSON.parse(readFileSync('agentes-workflow-ia.json', 'utf8')) // saída de wf exportar-agentes

// Módulo ESM do plugin (sem dependências): import dinâmico, porque o caminho só é conhecido em tempo de execução.
const { criarHooksWorkflowIA } = await import(pathToFileURL(join(pluginRoot, 'scripts', 'host', 'hooks-sdk.mjs')).href)

const q = query({
  prompt,
  options: {
    cwd: workspace,
    agents, // os 13 papéis
    hooks: criarHooksWorkflowIA({ pluginRoot }), // guardas, identidade (agent_type), medição de tokens, gate de parada
    allowedTools: ['Agent'],
    // as skills e os comandos continuam vindo do plugin habilitado no perfil (ou de `plugins`)
  },
})
```

## Sessões do RM Code (abas) durante a task

O MCP do RM Code oferece `session_open`/`session_send` para abrir e conduzir outras conversas, cada uma numa aba. A descrição da ferramenta sugere usá-la para "trabalhos em paralelo", e o orquestrador tem revisores paralelos: sem regra, às vezes ele abria uma aba por revisor em vez de chamar a ferramenta `Agent`.

Desde a 0.4.2:
- o orquestrador delega **só** pela ferramenta `Agent`, nesta sessão, com `run_in_background: true`, e espera a notificação de conclusão;
- o hook `guarda-sessoes` (PreToolUse `mcp__.*__session_(open|send)`) nega essas ferramentas enquanto houver task não pausada nem encerrada, e sempre para subagentes. Fora de task, o usuário continua podendo pedir abas novas;
- o `gate-parada` não trata como "parada sem progresso" a espera por subagentes ainda rodando (casados pelo `SubagentStop`, hook `fim-subagente`). O host precisa entregar o `SubagentStop` aos hooks (opção A: vem do `hooks.json`; opção B: o adaptador já o registra) e reconduzir o turno quando chega a notificação de conclusão do subagente (`task_notification`).

Além de poluir as abas, uma sessão aberta assim não carrega `agent_type`: os hooks a tratariam como o orquestrador e a atestação dos papéis (quem grava findings, julgamento do verificador-final) ficaria furada.

## Abas extras do plugin `security-guidance`

Mesmo com a delegação certa, apareciam abas "Security review for …" durante a task. Elas não vêm do Workflow IA: o plugin oficial `security-guidance` roda, em `Stop`, `SubagentStop` e `git commit`/`push`, uma revisão de segurança por LLM pelo Agent SDK em Python. Cada revisão é um processo `claude` filho que grava uma sessão nova (`entrypoint: sdk-py`) em `<CLAUDE_CONFIG_DIR>/projects/<projeto>/`, e o RM Code lista cada uma como aba. Num pipeline isso é uma aba por subagente que termina e por commit.

Desde a 0.5.1 o instalador (e o `/workflow-ia:atualizar`) grava `"env": {"ENABLE_CODE_SECURITY_REVIEW": "0"}` no `.claude/settings.json` do projeto quando o plugin está ativo. A variável desliga só essas revisões; os avisos por padrão nas edições continuam, e a revisão de segurança da task é a do `security-reviewer`.

O RM Code não passa `settingSources` ao `query()`, então pode não aplicar o `env` dos settings do projeto. O `wf ambiente` confere o ambiente real da sessão e avisa ("não chegou a esta sessão"); nesse caso ponha a mesma chave no `settings.json` do perfil da conta (`CLAUDE_CONFIG_DIR`, ex.: `agent-home/claude/settings.json`) ou desabilite o plugin nesse perfil.

## Verificação: o dump do `system:init`

Antes de rodar uma task, grave o `init` e confira. É o que decide se a integração está certa e esclarece qualquer dúvida de causa.

```ts
import { writeFileSync } from 'node:fs'

for await (const message of q) {
  if (message.type === 'system' && message.subtype === 'init') {
    writeFileSync(
      `${workspace}/.workflow-ia/runtime/sdk-init.json`,
      JSON.stringify({ agents: (message as any).agents, plugins: message.plugins, plugin_errors: (message as any).plugin_errors, skills: message.skills, slash_commands: message.slash_commands }, null, 2)
    )
  }
  // ...resto do loop do RM Code
}
```

Depois, no projeto:

```bash
.workflow-ia/wf ambiente --sdk-init .workflow-ia/runtime/sdk-init.json
```

Esperado: `modo` `nativo` (opção A) ou `host-provido` (opção B), `agentes: sim`. O campo `hooks` só vira `sim` depois que um comando Bash passou pelo hook (rode qualquer comando `wf` por dentro da sessão). Se `plugin_errors` não estiver vazio, o motivo aparece em `AMBIENTE:`.

## O que o usuário vê antes e depois

- **Antes da integração:** `/workflow-ia:task <card>` no RM Code. O orquestrador roda `wf ambiente`, que sai com código 5 (`AMBIENTE: faltam os subagentes: ...; os hooks do plugin não registraram atividade`), registra a task como **BLOQUEADA** com `AMBIENTE:` e a instrução de como resolver, sem criar branch nem alterar o projeto. É o F0, não a F1.
- **Depois:** o mesmo comando segue o pipeline normal.

## Checklist para o host

1. Passar `plugins: [{ type: 'local', path: <installPath absoluto> }]` (opção A) **ou** `agents` + `hooks` (opção B).
2. `allowedTools` incluindo `Agent`.
3. Garantir que a conta que roda a task tem o `workflow-ia@fabriki` habilitado (a conta 2 do RM Code não tem).
4. Não filtrar `agents` nem `hooks` do plugin em listas de permissão do host.
5. Rodar o dump do `init` e o `wf ambiente --sdk-init` como teste de fumaça.
