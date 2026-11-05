---
name: stack-e-convencoes
description: "Convenções de trabalho do projeto: descobrir stack e comandos reais (.workflow-ia/config.json e CLAUDE.md), nomes de branch, Conventional Commits com ID da task, tamanho de diff, estrutura de pastas Next.js App Router + módulos de domínio, naming, TypeScript strict, dependências, lockfile, variáveis de ambiente e formato único de erro. Use quando for iniciar qualquer task, criar branch, commitar, fazer push, criar arquivo ou pasta, adicionar dependência, nomear coisas ou revisar se o diff segue o padrão da codebase. Não use para decidir camadas, fronteiras de módulo e modelagem de domínio (use arquitetura-design) nem para pipeline de CI e deploy (use devops-observabilidade-lgpd)."
---

# Stack e convenções

Garante que todo código produzido pelo agente pareça escrito pelo time: mesma stack, mesmos comandos, mesmas pastas, mesmos nomes e o mesmo fluxo de Git.
`implementer`, `test-writer` e `fixer` seguem as regras ao construir. `quality-reviewer` usa o checklist para gerar findings de convenção; o `ops-reviewer` usa a parte de variáveis de ambiente e formato de erro. Em outro stack, aplique o equivalente.

## Regras inegociáveis

1. **Antes de escrever código, leia `.workflow-ia/config.json` (campo `comandos`) e o `CLAUDE.md` do projeto.** Supor stack ou comando gera diff incompatível e gate que não roda.
2. **Use exatamente os comandos de `comandos` para instalar, tipar, lintar, testar e buildar.** Comando inventado (`npm test` num projeto pnpm + vitest) dá falso verde ou falso vermelho.
3. **Se a codebase diverge do padrão desta skill, imite a codebase.** Consistência local vale mais que preferência global; registre a divergência no relatório se ela for relevante.
4. **O agente nunca abre PR, nunca faz merge e nunca faz push em `main`/`master`/`develop`.** Só commit e push do branch da task; revisão e merge são do humano.
5. **Branch no formato `<tipo>/<ID>-<slug>` e commits em Conventional Commits com o ID da task.** Sem isso o board não rastreia o trabalho e o changelog quebra.
6. **TypeScript strict sem `any`, sem `as` para calar o compilador, sem `@ts-ignore`/`@ts-expect-error` sem justificativa.** Cada escape é um bug de tipo adiado para produção.
7. **Nunca afrouxe gates para passar: `tsconfig`, regras de lint, thresholds de cobertura, `.skip`/`.only` em testes.** Gate afrouxado é gate quebrado (finding `urgente`).
8. **Nunca commite segredos, `.env`, dumps de banco, artefatos de build ou `coverage/`.** Segredo em histórico de Git exige rotação; artefato gera ruído e conflito.
9. **Respeite o gerenciador de pacotes do lockfile existente e commite o lockfile junto com `package.json`.** Dois lockfiles ou lockfile desatualizado quebram `install --frozen-lockfile` no CI.
10. **Dependência nova só com necessidade real, pacote mantido e sem duplicar algo que o projeto já tem.** Cada dependência é superfície de ataque e custo de manutenção.
11. **Diff pequeno e focado no escopo da task (alvo de ~400 linhas úteis).** Diff grande esconde bug e trava revisão; refatoração oportunista vai para outra task.
12. **Toda variável de ambiente nova entra no schema de env validado e no `.env.example`.** Variável não declarada quebra deploy em outro ambiente.
13. **Um único formato de erro na API e um único padrão de tratamento de erro no código.** Formatos misturados quebram o front e a observabilidade.

## Como construir

### Descoberta antes de agir
- Leia, nesta ordem: `CLAUDE.md` (raiz e da pasta afetada), `.workflow-ia/config.json`, `package.json` (scripts, `engines`, `type`), lockfile presente, `tsconfig.json`, config de lint/format.
- Abra 2 ou 3 arquivos vizinhos do que vai criar e copie o estilo: imports, exports nomeados ou default, nomes, tratamento de erro, testes.
- Se `comandos` não existir ou estiver incompleto, deduza pelos scripts do `package.json`, registre a suposição e não invente comando.
- Detalhes e exemplo de config: [references/config-e-comandos.md](references/config-e-comandos.md).

### Git
- Branch a partir da branch base definida no config ou no `CLAUDE.md` (padrão: `main`).
- Tipos de branch: `feat/`, `fix/`, `refactor/`, `chore/`, `test/`, `docs/`. Slug em kebab-case ASCII, curto.
- Commits atômicos: cada commit compila e conta uma história (teste RED, implementação GREEN, refatoração).
- Mensagem: `tipo(escopo): resumo no imperativo`, até ~72 caracteres, rodapé `Refs: <ID>`.
- Push só do branch da task e nunca forçado (`--force`, `--force-with-lease` e `+refspec` são bloqueados pelos hooks, inclusive no branch da task).
- Detalhes: [references/git-e-commits.md](references/git-e-commits.md).

### Estrutura de pastas (padrão Next.js App Router)
```
src/
  app/                    # rotas, layouts, route handlers, server actions finas
  modules/<modulo>/
    domain/               # entidades, regras, erros de domínio (sem Prisma, sem Next)
    application/          # casos de uso / services, portas (interfaces)
    infra/                # repositórios Prisma, adapters de fornecedores
    index.ts              # API pública do módulo
  components/             # UI compartilhada (design system)
  lib/                    # utilidades transversais (env, logger, prisma, http)
tests/ ou *.test.ts       # conforme o padrão já existente
```
- Nome de módulo pelo domínio de negócio (`vendas`, `estoque`, `caixa`), não pela tecnologia.
- Um arquivo, uma responsabilidade. Arquivo passando de ~300 linhas é sinal para dividir.
- Detalhes de naming e pastas: [references/estrutura-e-naming.md](references/estrutura-e-naming.md).

### Naming
- Arquivos: `kebab-case.ts`; componentes React `PascalCase.tsx` somente se o projeto já usa assim.
- Tipos e componentes em `PascalCase`; funções e variáveis em `camelCase`; constantes globais em `UPPER_SNAKE_CASE`.
- Booleanos com `is`/`has`/`can`/`deve`. Funções com verbo (`calcularTotal`, `listarProdutos`).
- Idioma dos identificadores: o que a codebase já usa (português de domínio ou inglês). Não misture no mesmo módulo.

### TypeScript
- `strict: true` e, se já habilitado, `noUncheckedIndexedAccess`. Não desligue flags.
- Tipos de fronteira derivados de schemas Zod (`z.infer<typeof schema>`), não duplicados à mão.
- `unknown` + narrowing em vez de `any`. `satisfies` em vez de `as` para checar objetos literais.
- Retorno explícito em funções exportadas de `application/` e `infra/`.

### Dependências e ambiente
- Antes de instalar, procure no `package.json` se já existe lib equivalente (datas, validação, HTTP, logger).
- Versão fixada pelo lockfile; nada de atualizar major fora do escopo.
- Env: um módulo `src/lib/env.ts` valida `process.env` com Zod no boot; o resto do código importa de lá.

### Higiene do diff
- Sem `console.log`, `debugger`, código comentado ou arquivo morto.
- `TODO` só com ID de task (`// TODO(VST-123): ...`).
- Não reformate arquivos fora do escopo; rode o formatter apenas nos arquivos tocados, se o projeto não tiver hook.

## Checklist de revisão

| # | Verificação | Severidade padrão |
|---|---|---|
| 1 | Agente abriu PR, fez merge ou fez push em `main`/`master`/`develop` | `urgente` |
| 2 | Segredo, `.env` real, token ou dump de dados commitado | `urgente` |
| 3 | `tsconfig`, lint, cobertura ou config de teste afrouxados para o gate passar | `urgente` |
| 4 | `.skip`, `.only`, `xit`, `test.todo` introduzidos em testes existentes | `alto` |
| 5 | `@ts-ignore`/`@ts-expect-error`/`eslint-disable` sem comentário de justificativa | `alto` |
| 6 | `package.json` alterado sem lockfile correspondente, ou dois lockfiles no repo | `alto` |
| 7 | Comando de verificação usado difere de `.workflow-ia/config.json` | `alto` |
| 8 | `any` explícito ou `as` usado para silenciar erro de tipo | `medio` |
| 9 | Dependência nova sem necessidade clara, duplicando lib existente ou pouco mantida | `medio` |
| 10 | Variável de ambiente nova fora do schema de env e do `.env.example` | `medio` |
| 11 | Formato de erro diferente do padrão da API/projeto | `medio` |
| 12 | Arquivo criado em pasta que contraria a estrutura (regra de negócio em `app/` ou `components/`) | `medio` |
| 13 | Diff com mudanças fora do escopo da task ou muito acima de ~400 linhas sem motivo | `medio` |
| 14 | Upgrade de versão major de dependência fora do escopo | `medio` |
| 15 | Artefatos gerados commitados (`.next/`, `dist/`, `coverage/`, `*.log`) | `medio` |
| 16 | `process.env.X` lido fora do módulo de env | `medio` |
| 17 | Commit sem ID da task ou fora de Conventional Commits | `baixo` |
| 18 | Branch fora do padrão `<tipo>/<ID>-<slug>` | `baixo` |
| 19 | Naming inconsistente com a codebase (idioma, caixa, prefixos) | `baixo` |
| 20 | `console.log`, `debugger` ou código comentado deixado no diff | `baixo` |
| 21 | `TODO` sem ID de task | `baixo` |
| 22 | Import relativo profundo (`../../../`) onde existe alias `@/` | `baixo` |
| 23 | Reformatação em massa de arquivos não relacionados | `baixo` |

Observação: `console.log` que imprime senha, token ou dado pessoal sobe para `alto` (ver devops-observabilidade-lgpd).

## Anti-padrões (errado → certo)

**Comando suposto em vez do configurado**
```ts
// errado: o agente roda o que acha que é o padrão
// $ npm test
// certo: lê .workflow-ia/config.json e executa comandos.testeUnitario
// { "comandos": { "testeUnitario": "pnpm vitest run" } }  ->  $ pnpm vitest run
```

**`as` para calar o compilador**
```ts
// errado
const produto = (await req.json()) as Produto;

// certo
const produto = produtoSchema.parse(await req.json()); // tipo inferido e validado
```

**`process.env` espalhado**
```ts
// errado: em qualquer arquivo
const url = process.env.GATEWAY_URL!;

// certo: src/lib/env.ts
import { z } from 'zod';
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  GATEWAY_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'test', 'production']),
});
export const env = envSchema.parse(process.env);
// uso: import { env } from '@/lib/env';
```

**Silenciar teste para passar o gate**
```ts
// errado
it.skip('[CA-2] bloqueia venda sem estoque', async () => { /* ... */ });

// certo: corrigir a implementação; o teste continua ativo e com o assert original
it('[CA-2] bloqueia venda sem estoque', async () => { /* ... */ });
```

**Commit sem rastreabilidade**
```ts
// errado:  "ajustes"
// certo:   "feat(vendas): bloqueia venda quando estoque é insuficiente
//
//           Refs: VST-123"
```

## Referências

- [references/config-e-comandos.md](references/config-e-comandos.md): leia no início de toda task ou quando `comandos` estiver ausente, incompleto ou falhando.
- [references/git-e-commits.md](references/git-e-commits.md): leia ao criar branch, escrever mensagens de commit, dividir commits ou fazer push.
- [references/estrutura-e-naming.md](references/estrutura-e-naming.md): leia ao criar arquivos, pastas ou módulos novos, ou ao nomear tipos, funções e rotas.
