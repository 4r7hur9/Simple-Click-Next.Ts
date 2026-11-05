---
name: instalacao-projeto
description: "Guia a instalação do Workflow IA num projeto: identifica se é projeto novo (vazio ou sem git) ou projeto em andamento; prepara o que falta (git, primeiro commit, scripts de teste sem watch), roda o instalador com --simular e depois de verdade, ajusta comandos com --set/--forcar, instala gitleaks/semgrep, confere com wf doctor e entrega ao humano a lista de arquivos para commitar e o primeiro card sugerido. Use quando pedirem para instalar, configurar ou preparar o Workflow IA num projeto que AINDA NÃO o tem (sem .workflow-ia/config.json), ou ao rodar /workflow-ia:instalar. Se o projeto já tem .workflow-ia/ (atualizar, migrar ou renovar depois de uma nova versão do plugin), use a skill atualizacao-projeto (/workflow-ia:atualizar). Não use para executar um card (use orquestrador-task) nem durante uma task em andamento (a configuração é decisão humana e os hooks bloqueiam o instalador)."
---

# Instalação do Workflow IA num projeto

A instalação é interativa: aqui **o humano está presente e decide**. Diferente da execução de um card, você pode e deve perguntar quando houver escolha (qual comando de teste usar, se gera o CI, se cria scripts). O que você não faz sem ele: commit, mudança no código da aplicação e decisões de configuração no escuro.

`<PLUGIN>` abaixo é a raiz do plugin: `${CLAUDE_PLUGIN_ROOT}` dentro do Claude Code (ou o caminho que o humano informar, ex.: `~/Code/workflow-ia`).

## Regras inegociáveis

1. **Nunca faça commit.** No fim, liste os arquivos para o humano revisar e commitar.
2. **Nunca edite `.workflow-ia/config.json` à mão.** Toda mudança passa pelo instalador (`--set`, `--forcar`). Os hooks negam a edição direta.
3. **Não instale no meio de uma task.** Se `.workflow-ia/wf status` mostrar task ativa não encerrada, pare e explique: o humano encerra ou pausa a task antes (e roda o instalador no terminal dele, se preferir).
4. **Simule antes de gravar.** Rode primeiro com `--simular` e mostre o resultado; só depois grave.
5. **Não invente comandos.** Todo comando do gate precisa existir e terminar sozinho (sem watch). Na dúvida, rode-o uma vez e mostre a saída.
6. **Não altere o código da aplicação.** Criar ou ajustar scripts no `package.json`, ou instalar dependências de desenvolvimento de teste, só com o "sim" do humano.

## Passo 0: diagnosticar o tipo de projeto

Rode e interprete:

```bash
git -C <projeto> rev-parse --is-inside-work-tree   # é repositório git?
git -C <projeto> log -1 --oneline                  # tem pelo menos um commit?
git -C <projeto> status --porcelain                # working tree limpo?
ls <projeto>/package.json <projeto>/.workflow-ia/config.json 2>/dev/null
```

| Situação | Caminho |
|---|---|
| Já tem `.workflow-ia/config.json` | **Atualização**: pare aqui e use a skill `atualizacao-projeto` (`/workflow-ia:atualizar`); veja "Reinstalar ou atualizar" |
| Sem git, sem commit ou sem código que rode | **Projeto novo**: passo 1A |
| Git com histórico e código rodando | **Projeto em andamento**: passo 1B |

Confira também os pré-requisitos: `node --version` (18 ou mais) e, se o humano vai usar o plugin pelo Claude Code, `claude plugin details workflow-ia@fabriki`.

## Passo 1A: projeto novo

O Workflow IA precisa de um projeto que **já rode**: o gate precisa de comandos, e o `wf red` exige ao menos um comando de teste. Ele não cria o stack do zero.

1. Pergunte o stack pretendido (ex.: Next.js + TypeScript + Prisma/PostgreSQL). Se o humano ainda não criou o esqueleto, sugira o gerador oficial (ex.: `npx create-next-app@latest`) e deixe que ele rode ou autorize.
2. Garanta os scripts mínimos, **sem modo watch** (modelos em [references/ajustes-por-pendencia.md](references/ajustes-por-pendencia.md)): `typecheck`, `lint`, `test:unit`, `build`. `test:integration` e `test:e2e` quando houver banco e UI.
3. Crie o primeiro commit se não houver: `git init` (se preciso), `git add -A`, `git commit -m "chore: projeto inicial"`. Esse é o único commit que você pode sugerir rodar, e só com o "sim" do humano, porque o instalador exige histórico.
4. Siga para o passo 2.

## Passo 1B: projeto em andamento

1. **Working tree limpo.** Se houver alterações, peça ao humano para commitar ou guardar (`git stash`) antes. Não mexa nelas.
2. **Branch base.** Confirme qual é o branch de integração (`main`, `master`, `develop`). O instalador detecta pelo `origin/HEAD` ou pelos nomes comuns; se estiver errado, corrija com `--set git.branchBase="develop"`.
3. **Scripts de teste.** Veja o `package.json`: existe script que roda os testes **uma vez**? `vitest` sem `run`, `jest --watch` e `--watchAll` travam o gate. Se só houver `test` em watch, proponha `test:unit` (modelos na referência).
4. **Migrations.** Se usa Prisma/Drizzle, avise: migrations que já existem no branch base ficam protegidas; o agente sempre cria migrations novas.
5. Siga para o passo 2.

## Passo 2: simular e instalar

```bash
node <PLUGIN>/scripts/instalar.mjs <projeto> --simular
```

Mostre ao humano, a partir da saída JSON:
- `stackDetectada` e `gerenciadorPacotes`;
- `branchBase`;
- `comandos` (um por etapa do gate) e `etapasObrigatorias`;
- `pendencias` e `avisos`.

Pergunte se algum comando está errado e se ele quer o CI (`--ci`, só quando o plugin estiver publicado num repositório do GitHub: `--marketplace owner/repo`). Depois grave, repetindo os ajustes combinados:

```bash
node <PLUGIN>/scripts/instalar.mjs <projeto> [--set comandos.testeUnitario="pnpm test:unit" ...] [--ci --marketplace owner/repo]
```

## Passo 3: resolver pendências

Cada pendência tem um ajuste na [referência](references/ajustes-por-pendencia.md). Pontos que confundem:

- **Etapa "não configurada" vira não obrigatória.** Depois que o humano criar o script, rodar o instalador de novo **preenche o comando, mas não torna a etapa obrigatória**. Para recalcular as obrigatórias, rode com `--forcar` **repetindo todos os `--set`** usados antes (o `--forcar` recalcula a config a partir da detecção).
- **Segredos e SAST.** Sem `gitleaks` a detecção de segredos fica desligada; sem `semgrep` o SAST opcional também. Sugira `brew install gitleaks semgrep` (ou o equivalente do sistema) e rode o instalador de novo.
- **Stack que não é Node.** Não há detecção automática: defina cada comando com `--set comandos.<nome>="..."` (ex.: `pytest -q`, `ruff check .`, `mypy .`).

## Passo 4: verificar

```bash
cd <projeto> && .workflow-ia/wf doctor
```

Todos os checks devem estar `ok: true`, exceto `working-tree` (fica sujo até o commit dos arquivos gerados). Para cada falha, explique a causa e o ajuste. Se possível, rode uma vez cada comando do gate para confirmar que termina sozinho e passa no estado atual do projeto: um gate vermelho antes da primeira task faz toda task começar com findings urgentes.

## Passo 5: entregar ao humano

Responda com:

1. **Resumo**: stack, gerenciador, branch base, etapas obrigatórias e o que ficou opcional/pendente.
2. **Arquivos para revisar e commitar**: `.workflow-ia/config.json`, `.workflow-ia/wf`, `.workflow-ia/README.md`, `.gitignore`, `CLAUDE.md`, `.claude/skills/workflow-ia` (o plugin versionado no repositório: quem clonar usa o Workflow IA sem instalar nada, depois de confiar na pasta), `.semgrepignore` e, se gerados, `.github/workflows/*` e `.claude/settings.json` (o instalador grava nele `ENABLE_CODE_SECURITY_REVIEW=0` quando o plugin `security-guidance` está ativo; veja `avisos` e `proximosPassos`). Comando sugerido (o humano roda): `git add .workflow-ia/config.json .workflow-ia/wf .workflow-ia/README.md .gitignore CLAUDE.md .claude/skills/workflow-ia .semgrepignore && git commit -m "chore: instala Workflow IA"`. Se a raiz agrupa vários repositórios (sub-pastas com `.git` própria), cada um recebeu a sua cópia do plugin: repasse o comando de commit de cada sub-repositório que está em `proximosPassos` (`pluginNoRepositorio[]` lista os arquivos por repositório).
3. **Proteção do branch base**: recomende exigir PR no GitHub (branch protection/ruleset). É a garantia final de que nada chega à base sem o humano.
4. **Primeiro card**: sugira começar pequeno e com revisão prévia: `/workflow-ia:spec <card>` para ler spec e plano; depois `/workflow-ia:retomar <ID>`. Card bom tem comportamento numerado, regras de negócio (principalmente dinheiro e permissão), erros esperados, fora de escopo e critérios de aceite com valores.

## Opcional: modo CI (0.7.0)

Vem desligado. Se o projeto é um monorepo com suítes longas e o humano quer delegar a verificação final ao GitHub Actions, sugira (sem ligar): `wf ci gerar` escreve a proposta do workflow em `.workflow-ia/ci/` (yml, patch do config, LEIA-ME) e `wf ci ativar` lista os passos do humano (copiar o yml para `.github/workflows/`, aplicar o patch com `--aplicar` fora do Claude Code, exigir o check `ci-ok`, `gh auth status`). O plugin nunca escreve em `.github/workflows/`. Detalhes em `docs/configuracao.md#ci`.

## Reinstalar ou atualizar

**A atualização de um projeto que já tem `.workflow-ia/` é da skill `atualizacao-projeto`** (`/workflow-ia:atualizar`): ela confere as versões, atualiza o plugin, roda `instalar.mjs --atualizar` com `--simular` e diff do config, **preserva os valores que o humano ajustou** (ex.: um `comandos.build` com variáveis de ambiente), aplica as migrações versionadas do schema, renova atalho, `CLAUDE.md`, `.gitignore` e git hooks, e confere com `wf doctor`. Leia `<PLUGIN>/skills/atualizacao-projeto/SKILL.md` e siga-a.

Casos que continuam aqui:

- **Plugin atualizado e projeto sem mudança**: nada a fazer além da atualização acima; o atalho `.workflow-ia/wf` acha a versão nova, e uma sessão nova do Claude Code carrega skills, subagentes e hooks.
- **Stack mudou ou scripts novos e o humano quer recalcular tudo**: `--forcar` + os `--set` anteriores **perde ajustes do humano**. Prefira `--atualizar` (preenche só o que falta) e aplique as sugestões com `--set`. Use `--forcar` só quando o humano pedir explicitamente para recalcular.
- **Gerar o CI depois**: rode com `--ci --marketplace owner/repo`; arquivos já existentes só são sobrescritos com `--forcar` (ou, em `--atualizar`, com `--confirmar-ci`).

## Referências

- [references/ajustes-por-pendencia.md](references/ajustes-por-pendencia.md): o que fazer com cada pendência do instalador e cada falha do `wf doctor`, com modelos de scripts por stack.
