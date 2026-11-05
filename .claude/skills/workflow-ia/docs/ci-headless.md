# Execução headless no GitHub Actions

O agente pode rodar sem você na máquina: você move o card para "Pronto p/ agente", uma automação dispara o GitHub Actions, e o agente executa o pipeline completo. Quando a task termina com veredito, um job separado publica o branch da task (só ele, sem force) e dispara as provas nele. Você recebe o card atualizado e o relatório.

## Gerar os workflows

```bash
node <plugin>/scripts/instalar.mjs <projeto> --ci --marketplace <owner>/<repo-do-plugin>
```

Isso cria dois arquivos:

| Arquivo | Disparo | Faz |
|---|---|---|
| `.github/workflows/workflow-ia-provas.yml` | push em `feat/**`, `fix/**`, `refactor/**`, `chore/**` | Roda o gate num runner limpo: a prova reproduzível, independente do agente |
| `.github/workflows/workflow-ia-agente.yml` | manual ou `repository_dispatch` | Instala o Claude Code e o plugin e executa `/workflow-ia:task <card>` |

## Relação com o modo CI (0.7.0)

O `workflow-ia-provas.yml` acima roda o **gate inteiro** num runner a cada push, como prova reproduzível independente do agente, e continua sendo gerado pelo instalador com `--ci`. O **modo CI** (`config.ci`, desligado por padrão; ver `docs/configuracao.md#ci`) é outra coisa: o próprio `wf verificar-limpo` da máquina dispara um workflow de **testes por app** (`wf ci gerar` propõe o `ci.yml`) e lê o resultado do run do mesmo SHA como prova das etapas pesadas. Os dois podem coexistir; só o modo CI entra no veredito da task.

## Host

O job do agente é um host **nativo**: instala o plugin do marketplace e roda `claude -p`, então os 13 subagentes e os hooks carregam como no Claude Code CLI. O F0 confere isso com `wf ambiente` antes de criar a task; se algo faltar, a task termina BLOQUEADA com `AMBIENTE:` em vez de falhar no meio. Veja [portabilidade-hosts.md](portabilidade-hosts.md).

No CI o orquestrador delega aos subagentes em primeiro plano (`run_in_background: false`): com `claude -p` o processo termina junto com o turno, então não há notificação de conclusão para esperar. Pelo mesmo motivo, com `WORKFLOW_IA_CI=1` o gate de parada não abre a exceção para subagentes em segundo plano.

Alternativa sem marketplace: a partir da 0.5.2 o projeto versiona o plugin em `.claude/skills/workflow-ia/` (ver `docs/configuracao.md`). No CI dá para carregar essa cópia com `claude -p --plugin-dir .claude/skills/workflow-ia ...` (ou `CLAUDE_CODE_PLUGIN_DIRS`), dispensando o `WORKFLOW_IA_PLUGIN_TOKEN`. Os modelos gerados continuam instalando pelo marketplace.

## Secrets e variáveis

| Nome | Obrigatório | Uso |
|---|---|---|
| `ANTHROPIC_API_KEY` ou `CLAUDE_CODE_OAUTH_TOKEN` | sim | Autenticação do Claude Code |
| `WORKFLOW_IA_PLUGIN_TOKEN` | se o repositório do plugin for privado | Token com leitura do repositório do plugin |

## Segurança do job do agente

- O job `agente` roda com `contents: read`, `pull-requests: read` e `issues: write`: o token dele **não faz push, merge (a API de merge exige `contents: write`) nem abre PR**, mesmo que algo contorne os hooks. O checkout usa `persist-credentials: false`.
- O push do branch da task é feito depois, pelo job `publicar` (`contents: write`), que não executa o agente: recebe o branch como bundle, recusa a base e os branches protegidos da config e envia sem force.
- **Proteja o branch base no GitHub** (ruleset exigindo PR e revisão). É a garantia final de que nada chega à base sem o humano.
- Dentro da sessão, os hooks (`guarda-bash`) também só permitem push do branch da task.
- `--max-budget-usd` é o teto de custo por execução (padrão 20, ajustável no disparo). É uma opção do Claude Code no CI, não um limite do Workflow IA: o WF só mede e mostra os tokens, sem teto; os limites dele são de rodadas (`limites` no config).
- `timeout-minutes: 120` é o teto de tempo.
- O log da execução fica fora do repositório (`$RUNNER_TEMP`), para não sujar o working tree que a verificação exige limpo.

## Disparar pelo board

Qualquer automação que faça um POST na API do GitHub serve (automação do Notion/Linear, Zapier, Make, n8n):

```bash
curl -X POST \
  -H "Authorization: Bearer <token com permissão de actions/contents>" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/<owner>/<repo>/dispatches \
  -d '{"event_type":"workflow-ia-task","client_payload":{"task":"VST-123","orcamento_usd":"15"}}'
```

## Board no CI

Para o agente ler e atualizar o card no CI, a sessão precisa do conector MCP do board:

1. Crie `.workflow-ia/mcp-ci.json` com o servidor MCP do seu board. Os tokens vêm de variáveis de ambiente, nunca literais no arquivo.
2. Acrescente `--mcp-config .workflow-ia/mcp-ci.json` ao comando `claude -p` do workflow.
3. Acrescente as ferramentas do conector em `--allowedTools` (ex.: `mcp__notion`).
4. Passe os tokens como secrets no `env` do passo.

Sem isso, o agente funciona em modo manual: o texto ou ID do card chega pelo `client_payload`, e o relatório fica no resumo do job e nos artefatos.

## Artefatos

Cada execução publica `.workflow-ia/tasks/` (spec, plano, findings, provas, relatório, PR) e o log completo da sessão como artefato do job, retido por 30 dias. O `report.md` também aparece no resumo do job.
