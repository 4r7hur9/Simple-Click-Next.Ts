# Ajustes por pendência

Leia quando o instalador listar `pendencias`/`avisos` ou o `wf doctor` reprovar algum check. Todo ajuste de config passa pelo instalador (`--set`/`--forcar`), nunca por edição direta do `config.json`.

## Pendências do instalador

| Pendência | Ajuste |
|---|---|
| Gate "typecheck" não configurado | Script `"typecheck": "tsc --noEmit"` (TypeScript). Sem TS, deixe opcional ou use o checador do stack. |
| Gate "lint" não configurado | ESLint/Biome com script `"lint"`. Sem linter, deixe opcional e registre com o humano. |
| Gate "teste-unitario" não configurado | Script que roda os testes **uma vez** (modelos abaixo). É o mínimo: sem teste unitário o `wf red` não funciona. |
| Gate "teste-integracao" não configurado | `"test:integration"` quando houver banco ou API (Vitest + Testcontainers/PostgreSQL recomendado). Pode ficar opcional em projeto sem banco. |
| Gate "teste-e2e" não configurado | `"test:e2e"` com Playwright quando houver UI. A regra `provas.exigirE2E` padrão exige E2E só em task com UI. |
| Gate "build" não configurado | Script `"build"`. |
| Gate "segredos" não configurado | `brew install gitleaks` (ou o pacote do sistema) e rode o instalador de novo. |
| SAST opcional desativado | `brew install semgrep` (ou `pipx install semgrep`) e rode o instalador de novo. |
| Sem package.json | Stack sem detecção: defina cada comando com `--set comandos.<nome>="..."`. |
| Projeto sem git | `git init`, primeiro commit (com o "sim" do humano) e rode o instalador de novo. |

Depois de criar scripts, lembre: rodar o instalador de novo **preenche o comando**, mas a etapa continua opcional. Para torná-la obrigatória, rode com `--forcar` repetindo os `--set` usados antes.

## Falhas do `wf doctor`

| Check | Causa comum | Ajuste |
|---|---|---|
| `config` | Instalador não rodou nesta pasta | Rode o instalador na raiz do repositório |
| `git` | Não é repositório git | `git init` e primeiro commit |
| `branch-base` | Branch base configurado não existe | `--set git.branchBase="<branch>"` |
| `gate:<etapa>` "OBRIGATÓRIA e não configurada" | Comando vazio numa etapa obrigatória | `--set comandos.<nome>="..."` ou `--forcar` depois de criar o script |
| `gitignore` | Faltam `.workflow-ia/runtime/` e `.workflow-ia/tasks/` | Rode o instalador de novo (ele acrescenta) |
| `working-tree` | Arquivos gerados ainda não commitados | Esperado até o humano commitar |

Nomes das chaves de comando: `instalar`, `typecheck`, `lint`, `lintArquivo`, `formatarArquivo`, `testeUnitario`, `testeIntegracao`, `testeE2E`, `testeArquivo`, `build`, `sast`, `dependencias`, `segredos`. Em `lintArquivo`, `formatarArquivo` e `testeArquivo`, `{arquivo}` é substituído pelo caminho editado; nos comandos do gate, `{base}` vira a ref do branch base (ex.: o `segredos` padrão usa `--log-opts="{base}..HEAD"`).

## Modelos de scripts (sem watch)

Vitest:
```json
{
  "typecheck": "tsc --noEmit",
  "lint": "eslint .",
  "test:unit": "vitest run --project unit",
  "test:integration": "vitest run --project integration",
  "test:e2e": "playwright test",
  "build": "next build"
}
```
Sem projetos do Vitest, use `vitest run` para o unitário e um `--config`/pasta separada para integração.

Jest: `"test:unit": "jest --ci"` (nunca `--watch`/`--watchAll`).

Node puro: `"test:unit": "node --test"`.

Python: `--set comandos.testeUnitario="pytest -q"`, `--set comandos.lint="ruff check ."`, `--set comandos.typecheck="mypy ."`.

## Monorepo

Instale na raiz do repositório (onde fica o `.git`). Se os scripts estão nos workspaces, aponte os comandos para eles, por exemplo `--set comandos.testeUnitario="pnpm --filter ./apps/web run test:unit"`. Migrations em subpastas (`packages/db/prisma/migrations`) já são reconhecidas pelas proteções.

## Tags de teste

O Workflow IA liga cada critério de aceite a testes pela tag `[CA-n]` **no nome do teste** (ex.: `test('[CA-1] aplica 5% com 10 unidades', ...)`). Os padrões de arquivo de teste reconhecidos ficam em `protecoes.padroesTeste` (`**/*.test.*`, `**/*.spec.*`, `__tests__/`, `tests/`, `test/`, `e2e/`); se o projeto usar outro, ajuste com `--set protecoes.padroesTeste='["**/*.test.*","**/*_test.go"]'` (valor em JSON; substitui a lista inteira).
