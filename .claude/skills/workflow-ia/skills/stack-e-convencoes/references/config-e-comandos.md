# Config do projeto e comandos

Como descobrir a stack real e quais comandos rodar antes de escrever uma linha de código.

## Ordem de leitura

1. `CLAUDE.md` na raiz e, se existir, o da pasta que será alterada. Instruções do time prevalecem sobre esta skill.
2. `.workflow-ia/config.json`, em especial o campo `comandos`.
3. `package.json`: `scripts`, `engines`, `packageManager`, `type` (`module` ou `commonjs`), `workspaces`.
4. Lockfile presente: define o gerenciador de pacotes.
5. `tsconfig.json` (e `tsconfig.*.json` herdados): `strict`, `paths`, `moduleResolution`.
6. Config de lint e formatação: `eslint.config.*` ou `.eslintrc*`, `.prettierrc*`, `biome.json`.
7. Config de testes: `vitest.config.*`, `jest.config.*`, `playwright.config.*`.
8. `prisma/schema.prisma` (ou equivalente), para entender o modelo antes de mexer.

## Campo `comandos`

As chaves são fixas (ver `docs/configuracao.md` do plugin); os valores são os do projeto. Exemplo:

```json
{
  "comandos": {
    "instalar": "pnpm install --frozen-lockfile",
    "typecheck": "pnpm tsc --noEmit",
    "lint": "pnpm lint",
    "testeUnitario": "pnpm vitest run",
    "testeIntegracao": "pnpm vitest run --project integration",
    "testeE2E": "pnpm playwright test",
    "testeArquivo": "pnpm exec vitest run {arquivo}",
    "build": "pnpm build"
  }
}
```

Regras de uso:
- Execute o comando exatamente como está. Não troque `pnpm` por `npm`, não adicione flags que mudam o comportamento (ex.: `--passWithNoTests`, `--coverage=false`).
- Se precisar filtrar um teste durante o desenvolvimento, use o mecanismo do runner (`pnpm vitest run caminho/do/teste.test.ts`), mas o gate final roda o comando completo.
- Se um comando falhar por ambiente (Docker ausente para Testcontainers, porta ocupada), registre a falha como bloqueio; não reescreva o comando para contornar.

## Quando `comandos` não existe ou está incompleto

- Deduza pelos `scripts` do `package.json` (`typecheck`, `lint`, `test`, `build`).
- Se não houver script de typecheck, use `<gerenciador> tsc --noEmit`.
- Registre no relatório da task quais comandos foram deduzidos e por quê.
- Nunca crie nem altere `.workflow-ia/config.json`: é decisão humana (os hooks bloqueiam). Etapa obrigatória do gate sem comando configurado torna a task BLOQUEADA (skill `politica-autonomia`).

## Detectar o gerenciador de pacotes

| Arquivo presente | Gerenciador | Instalação reprodutível |
|---|---|---|
| `pnpm-lock.yaml` | pnpm | `pnpm install --frozen-lockfile` |
| `package-lock.json` | npm | `npm ci` |
| `yarn.lock` | yarn | `yarn install --frozen-lockfile` (v1) ou `yarn install --immutable` (berry) |
| `bun.lock` ou `bun.lockb` | bun | `bun install --frozen-lockfile` |

- O campo `packageManager` do `package.json`, quando existe, é a fonte da verdade da versão.
- Nunca gere um segundo lockfile. Se aparecer um, remova do diff.

## Imitar a codebase quando divergir do padrão

Esta skill descreve um padrão. A codebase real pode fazer diferente. Nesse caso:

| Situação | O que fazer |
|---|---|
| Projeto usa `src/features/` em vez de `src/modules/` | Use `src/features/` |
| Identificadores em inglês | Escreva em inglês, mesmo com domínio em português |
| Testes em `__tests__/` | Crie testes em `__tests__/` |
| Commits sem escopo | Mantenha o tipo e o ID da task; escopo é opcional |
| Erros retornados como `{ error: { code, message } }` | Siga esse formato, não introduza Problem Details numa task isolada |
| Jest em vez de Vitest | Use Jest e suas APIs |

Exceções: regras de segurança e de integridade (segredos, gates, autorização, transações) não se relaxam por "a codebase já faz assim". Nesse caso, siga a regra e registre o débito encontrado como finding separado.

## Ambiente local mínimo

- `.env.example` documenta todas as variáveis, com valores fictícios.
- `.env`, `.env.local` e `.env.*.local` estão no `.gitignore`. Se não estiverem, é finding.
- Testes de integração usam banco próprio (Testcontainers ou banco de teste), nunca o banco de dev compartilhado e nunca produção.
