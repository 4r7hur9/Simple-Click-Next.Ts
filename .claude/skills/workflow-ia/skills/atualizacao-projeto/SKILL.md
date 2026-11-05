---
name: atualizacao-projeto
description: "Atualiza o Workflow IA num projeto que JÁ tem .workflow-ia/config.json: confere a versão do plugin na máquina e a do config do projeto, atualiza o plugin se estiver atrás (claude plugin marketplace update + plugin update), roda o instalador em modo --atualizar (primeiro com --simular, mostrando o diff do config: o que muda e o que é preservado), aplica as migrações do config sem perder os ajustes do humano (ex.: build com variáveis de ambiente), renova o atalho wf, a seção do CLAUDE.md, o .gitignore e os git hooks, confere com wf doctor (inclui a seção host) e com cada comando do gate, e entrega a lista de arquivos e o comando de commit sugerido, sem nunca fazer commit. Use quando pedirem para atualizar/migrar/renovar o Workflow IA num projeto que já o usa, depois de uma nova versão do plugin, ou ao rodar /workflow-ia:atualizar. Para instalar pela primeira vez (projeto sem .workflow-ia/) use a skill instalacao-projeto. Não use durante uma task em andamento nem para executar um card."
---

# Atualização do Workflow IA num projeto

Aqui o **humano está presente e decide**. Esta skill atualiza um projeto que já tem o Workflow IA; ela **preserva o que o humano ajustou** e só mexe no que é do plugin. Para o primeiro setup use `instalacao-projeto`.

`<PLUGIN>` é a raiz do plugin: `${CLAUDE_PLUGIN_ROOT}` dentro do Claude Code (ou o caminho que o humano informar, ex.: `~/Code/workflow-ia`). `<projeto>` é a raiz do projeto.

## Por que não usar `--forcar`

`--forcar` recalcula o config inteiro a partir da detecção do stack e **perde ajustes do humano** (por exemplo, `comandos.build = "CACHE_DISABLED=true REDIS_URL=rediss://build.invalid:6380 npm run build"`). O modo `--atualizar` parte do config existente: preserva todo valor ajustado, preenche só as chaves novas, aplica migrações versionadas do schema (`versao` 1 → 2 …) e relata o que sugere mudar sem aplicar.

## Regras inegociáveis

1. **Nunca faça commit.** No fim, liste os arquivos e sugira o comando; o humano roda.
2. **Nunca edite `.workflow-ia/config.json` à mão.** A atualização passa pelo instalador (`--atualizar`, e `--set` quando o humano aceitar uma sugestão). Os hooks negam a edição direta.
3. **Com task ativa, pare.** Se `.workflow-ia/wf status` mostrar task não encerrada, explique e pare: o humano encerra ou pausa a task antes.
4. **Working tree limpo.** Se houver alterações pendentes, peça ao humano para commitar ou guardar (`git stash`). Não mexa nelas.
5. **Simule antes de gravar** e mostre o diff do config. Só grave depois do "sim".
6. **Workflows de CI só com confirmação.** Se já existirem, o instalador mostra o diff e não sobrescreve; só rode com `--confirmar-ci` depois de o humano ver o diff e aceitar.
7. **Não altere o código da aplicação** nem os scripts do `package.json`.

## Passo 1: diagnóstico

Rode e interprete (são só leitura):

```bash
# versão do plugin na fonte
jq -r .version <PLUGIN>/.claude-plugin/plugin.json
# versão do plugin instalado na máquina
claude plugin details workflow-ia@fabriki        # procure a linha "version"
#   sem o binário claude: jq -r '.plugins["workflow-ia@fabriki"][0].version' ~/.claude/plugins/installed_plugins.json
# versão do schema do config do projeto e a atual do plugin
jq -r .versao <projeto>/.workflow-ia/config.json
node --input-type=module -e "import('<PLUGIN>/scripts/lib/migracoes.mjs').then(m => console.log(m.CONFIG_VERSAO_ATUAL))"
# working tree e task ativa
git -C <projeto> status --porcelain
<projeto>/.workflow-ia/wf status                  # "Nenhuma task ativa" é o resultado bom
```

| Situação | Ação |
|---|---|
| Não existe `<projeto>/.workflow-ia/config.json` | Não há o que atualizar: use a skill `instalacao-projeto`. |
| Task ativa não encerrada | **Pare** e explique (regra 3). |
| Working tree sujo | Peça commit ou stash (regra 4). |
| Plugin instalado < fonte | Passo 2. |
| Plugin instalado = fonte e `versao` do config = atual | Provavelmente nada a migrar; ainda assim rode o Passo 3 com `--simular` (renova atalho, seção do `CLAUDE.md` e git hooks se estiverem velhos). |

Resuma ao humano: versão instalada × fonte, `versao` do config × atual, e se pode seguir.

## Passo 2: plugin na máquina

Só se a versão instalada for **menor** que a da fonte:

```bash
claude plugin marketplace update fabriki
claude plugin update workflow-ia@fabriki
claude plugin details workflow-ia@fabriki        # confira: skills, comandos, agentes e hooks
```

Se o `claude` não estiver no PATH (ex.: rodando fora do Claude Code), **não tente contornar**: passe esses comandos ao humano para rodar no terminal dele e espere a confirmação. Não edite `~/.claude/settings.json` nem os JSON de `~/.claude/plugins/` à mão.

Lembrete para o fim: as skills, os subagentes e os hooks da versão nova só carregam numa **sessão nova** do Claude Code aberta no projeto.

## Passo 3: atualizar o projeto

Primeiro, **sempre** simule:

```bash
node <PLUGIN>/scripts/instalar.mjs <projeto> --atualizar --simular
```

Mostre ao humano, a partir do JSON (`atualizacao`):

- `versao`: de → para e `migracoes[]` (cada uma com as `alteracoes`);
- `adicionado[]`: chaves novas preenchidas com o padrão;
- **`preservado[]`**: valores que o humano ajustou e que ficam como estão (destaque o `comandos.build` customizado, se houver);
- `sugeridos[]`: comandos que o humano deixou vazios e que a detecção encontrou (inclusive os da execução focada da 0.6.0: `testeArquivos`, `testesRelacionados`, `testeE2EArquivos`) e as otimizações do loop que uma instalação nova liga (`gate.falharRapido`, `gate.repetirPorCarga`, `gate.paralelismo`). **Não são aplicados.** Se ele quiser um, rode com o `aplicar` do item (ex.: `--set comandos.<nome>="<valor>"`, `--set gate.falharRapido=true`);
- `arquivos[]`: o que muda no atalho `wf`, `README`, `CLAUDE.md`, `.gitignore`, nos git hooks e na cópia do plugin em `.claude/skills/workflow-ia` (de cada repositório: raiz e sub-repositórios; `pluginNoRepositorio[]` agrupa por repositório);
- `pendencias[]` e `avisos[]`;
- `atualizacao.ci[]`: para cada workflow de CI que difere do modelo atual, o diff. Pergunte se quer sobrescrever.

Com o "sim" do humano, grave (repetindo os `--set` combinados):

```bash
node <PLUGIN>/scripts/instalar.mjs <projeto> --atualizar [--set comandos.lint="..."] [--confirmar-ci]
```

A atualização é idempotente: rodar de novo não muda nada.

### Migração 6 → 7 (0.6.0): desempenho do loop e gate incremental

A migração acrescenta tudo **desligado**: o gate continua igual até o humano decidir. Explique as opções e pergunte quais ligar (cada uma é um `--set` ou uma edição do humano no `config.json`):

- **Falhar rápido** (`--set gate.falharRapido=true`) com `custo` por etapa (`baixo` para typecheck, lint e segredos; `alto` para integração e e2e). Sem `custo`, todas ficam na mesma onda e nada muda. O `custo` vai em cada item de `gate.etapas`: edição do humano (o `--set` não altera itens de lista).
- **Repetição por carga** (`--set gate.repetirPorCarga=1`): repete uma vez a etapa que falhou por timeout, porta, memória ou banco. Teto por etapa: `timeoutSegundos` no item da etapa.
- **Paralelismo** (`--set gate.paralelismo=2`): etapas da mesma onda rodam juntas. Em máquina já carregada, deixe `1`.
- **Vagas de recurso**, para várias tasks na mesma máquina: `--set recursos.vagasPesadas=2`, mais `"pesada": true` nas etapas caras. A etapa recebe `WF_VAGA` para mapear um banco de teste por vaga. Depende da máquina: só ligue se o humano rodar tasks em paralelo.
- **Execução focada**: `testeArquivos`/`testesRelacionados` (sugeridos quando a detecção acha Vitest ou Jest) deixam o `wf red` e o `wf checar` rodarem só o que importa. Num monorepo, `typecheckArquivos` permite o typecheck só do app. A migração grava `provas.redFocado: false`: o `wf red` continua completo até o humano ligar com `--set provas.redFocado=true`.
- **Gate incremental** (`gate.cacheEntreIteracoes`, já `true`): só reaproveita etapas que declaram `insumos`; sem insumos, nada muda (veja `docs/configuracao.md`). A etapa `segredos` e qualquer uma com `{base}`/`WF_BASE` no comando nunca vêm do cache (dependem do histórico), sem precisar mexer nas etapas do humano. Uma etapa própria que dependa do histórico leva `"cacheavel": false`.
- **Reserva de vez** (`recursos.reservaSegundos`, padrão 300, preenchido automaticamente): quanto tempo o `wf aguardar-vaga` reserva a vez da task para o gate seguinte.

### Migração 7 → 8 (0.7.0): dependeDe e modo CI

A migração só acrescenta o bloco `ci` **desligado** (`ci.ativo: false`); `gate.etapas[].dependeDe` é opcional e nenhuma etapa ganha dependência sozinha. O gate continua idêntico ao de antes, tudo na máquina. Ligar o CI é decisão do humano, depois da atualização: `wf ci gerar` (proposta em `.workflow-ia/ci/`) e `wf ci ativar` (passos; `--aplicar` só no terminal do humano). O `wf doctor` ganha os checks `gate-dependencias` e `ci`.

## Passo 4: verificar

```bash
cd <projeto> && .workflow-ia/wf doctor
```

Todos os checks devem estar `ok: true`, exceto `working-tree` (fica sujo até o commit). Leia a seção `host` do resultado:

- `hooks`: `nao` é esperado aqui (um terminal ou uma sessão sem tool call recente não carimba os hooks); numa sessão nova do Claude Code, `wf ambiente` mostra `sim`;
- `agentes`: `desconhecido` é esperado fora de uma sessão de agente;
- `avisos`: não reprovam, mas repasse ao humano. O do `security-guidance` diz que o plugin vai abrir uma sessão/aba por subagente e por commit; se ele persistir dentro do RM Code mesmo com o `.claude/settings.json` atualizado, a variável precisa ir para o settings do perfil (veja `docs/hosts/rmcode.md`);
- se o host for o RM Code ou outro app sobre o Agent SDK, aponte `docs/hosts/rmcode.md` do plugin;
- se o host registra os papéis por conta própria (seção B1 de `docs/hosts/rmcode.md`), avise que ele precisa **exportar os agentes de novo** (`wf exportar-agentes`) sempre que a versão do plugin acrescentar um papel. Na 0.5.3 entrou o `ops-reviewer` (13 papéis): sem reexportar, `wf ambiente` recusa a task com `AMBIENTE`.

Depois **rode uma vez cada comando do gate** (os de `config.gate.etapas`, resolvidos em `config.comandos`) para confirmar que terminam sozinhos e passam no estado atual. Um gate vermelho antes da primeira task faz toda task começar com findings urgentes. Mostre as falhas; não as corrija sem pedir.

## Passo 5: entrega

1. **Resumo**: versões antes/depois, o que foi migrado, o que foi preservado, sugestões pendentes e pendências do instalador.
2. **Arquivos alterados**: liste com `git status --porcelain`. Normalmente: `.workflow-ia/config.json`, `.workflow-ia/wf`, `.workflow-ia/README.md`, `.gitignore`, `CLAUDE.md`, `.claude/skills/workflow-ia` (o código do plugin versionado no projeto: quem clona só recebe a versão nova depois desse commit), `.semgrepignore` e, se confirmados, `.github/workflows/workflow-ia-*.yml`. Em sub-repositórios, use o comando de commit que o instalador sugere para cada um (`proximosPassos`). Os git hooks ficam em `.git/hooks` e **não são versionados**.
3. **Comando de commit sugerido** (o humano roda): `git add .workflow-ia/config.json .workflow-ia/wf .workflow-ia/README.md .gitignore CLAUDE.md .claude/skills/workflow-ia && git commit -m "chore: atualiza Workflow IA para <versão>"`. Acrescente os workflows e o `.claude/settings.json` se foram alterados (com o plugin `security-guidance` ativo, a atualização grava nele `ENABLE_CODE_SECURITY_REVIEW=0`, que impede uma sessão/aba nova por subagente e por commit).
4. **Próximo passo**: abrir uma sessão **nova** do Claude Code no projeto e rodar `/workflow-ia:doctor`; depois `/workflow-ia:task <card>`.
