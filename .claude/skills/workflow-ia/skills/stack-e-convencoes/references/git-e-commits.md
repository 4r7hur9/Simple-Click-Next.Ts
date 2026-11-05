# Git: branches, commits e push

O agente trabalha num branch por task, faz commits pequenos e rastreáveis e entrega com push. PR e merge são sempre do humano.

## Branch

Formato: `<tipo>/<ID>-<slug>`

| Tipo | Quando | Exemplo |
|---|---|---|
| `feat` | Funcionalidade nova | `feat/VST-123-desconto-por-item` |
| `fix` | Correção de bug | `fix/VST-130-total-arredondado-errado` |
| `refactor` | Mudança sem alterar comportamento | `refactor/VST-140-extrair-servico-caixa` |
| `chore` | Build, deps, config | `chore/VST-150-atualiza-prisma` |
| `test` | Só testes | `test/VST-155-cobertura-estoque` |
| `docs` | Só documentação | `docs/VST-160-adr-multitenancy` |

- `ID` exatamente como no board (ex.: `VST-123`, `PM-42`).
- Slug em kebab-case ASCII, sem acentos, até ~5 palavras.
- Criado a partir da branch base atualizada (`git fetch` e base em `origin/<base>`).

## Conventional Commits

```
<tipo>(<escopo opcional>): <resumo no imperativo, minúsculas, sem ponto final>

<corpo opcional: o porquê, não o como>

Refs: <ID>
```

Tipos aceitos: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `perf`, `build`, `ci`.

Exemplos:
```
test(vendas): cobre bloqueio de venda sem estoque [CA-2]

Refs: VST-123
```
```
feat(vendas): bloqueia venda quando estoque é insuficiente

A validação acontece dentro da transação com lock da linha de estoque
para evitar dois caixas vendendo a última peça.

Refs: VST-123
```
```
fix(caixa)!: fechamento passa a usar centavos inteiros

BREAKING CHANGE: campo valorFechamento agora é inteiro em centavos.
Refs: VST-130
```

Regras:
- Um commit por passo lógico do fluxo: testes RED, implementação GREEN, refatoração, correção de finding.
- Commit de testes RED pode falhar nos testes, mas deve compilar e passar lint, se o projeto exigir hooks.
- Se o projeto usa o ID no escopo (`feat(VST-123): ...`), siga o projeto.
- Nunca use `--no-verify` para pular hooks. Hook falhando é problema a resolver.
- Não reescreva histórico de commits já enviados: push forçado (`--force`, `--force-with-lease`, `+refspec`) é bloqueado pelos hooks, inclusive no branch da task.

## Tamanho do diff

- Alvo: até ~400 linhas úteis alteradas (sem contar lockfile, snapshots e migrations geradas).
- Se a task exigir muito mais, registre no relatório e sugira divisão; não a divida por conta própria em vários branches.
- Refatoração que não é necessária para a task vira sugestão no relatório, não commit.

## Push e entrega

- `git push -u origin <branch-da-task>`.
- Proibido: push em `main`, `master`, `develop` ou branch de release; `git merge` na base; abrir PR via `gh pr create` ou API.
- O relatório de entrega aponta o branch e os commits. O humano abre o PR, revisa e faz merge.

## Arquivos que nunca entram em commit

- `.env`, `.env.local`, qualquer arquivo com segredo real, chaves `.pem`/`.key`.
- `node_modules/`, `.next/`, `dist/`, `build/`, `coverage/`, `playwright-report/`, `test-results/`.
- Dumps de banco (`*.sql` com dados, `*.dump`) e exports com dados pessoais.
- Arquivos de editor e SO (`.DS_Store`, `.idea/`), salvo se o time versiona.

Se algo disso aparecer no `git status`, confira o `.gitignore` antes de commitar. Se um segredo já foi commitado, não basta remover no commit seguinte: registre finding `urgente` pedindo rotação da credencial.

## Resolver conflito com a base

- Rebase do branch da task sobre a base atualizada é preferível a merge da base, se o projeto não indicar o contrário, e só antes do primeiro push do branch (depois exigiria push forçado, que é bloqueado).
- Após resolver, rode todos os comandos do gate de novo.
- Conflito em migration: nunca edite migration já aplicada na base. Gere uma nova migration por cima.
