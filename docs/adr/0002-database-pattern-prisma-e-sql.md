# ADR 0002 — Database Pattern: Prisma tipado + repositório com SQL, por um único caminho (`core/db.ts`)

- **Estado:** aceita (já é o comportamento do código; este registro explica o porquê)
- **Formato:** MADR
- **Código:** `apps/api/src/core/db.ts`, repositórios `apps/api/src/modules/*/*.repo.ts` (ex.: `modules/auth/identidade.repo.ts`), SQL cru em `criar-pedido.usecase.ts:156`, migrações em `packages/database/migrations/`

## Contexto e problema

O SimpleClick é multi-loja: cada linha pertence a uma loja e uma loja nunca pode ler a outra. O isolamento é feito no PostgreSQL (políticas por linha, contexto gravado com `set_config(..., is_local => true)` dentro da transação). Isso exige que **toda** consulta passe por uma transação com o contexto já aplicado, e que o agrupador de conexões nunca entregue a conexão de uma loja à requisição de outra.

## Fatores de decisão

- Isolamento por loja precisa ser impossível de esquecer em rota nova.
- Tipos em TypeScript para a maior parte das consultas.
- SQL de verdade onde o ORM atrapalha (funções do banco, `FOR UPDATE`, conversão condicional do carrinho).
- Migrações revisáveis e versionadas.

## Alternativas consideradas

1. **Prisma direto nas rotas e casos de uso** (descartada). Cada rota receberia o `PrismaClient`; o contexto da loja seria responsabilidade de quem lembra de abrir transação. Um esquecimento vaza dados entre lojas sem erro nem log.
2. **SQL cru com `pg` em tudo, sem ORM** (descartada). Máximo controle, mas perde os tipos gerados do esquema e multiplica código repetitivo em CRUD simples.
3. **Prisma Migrate para o esquema** (descartada). As migrações são SQL escrito à mão (políticas, funções, índices parciais) e o Prisma só gera os tipos.

## Decisão

Adotar **Prisma como query builder tipado + repositório com SQL cru onde preciso**, atrás de **um único ponto de acesso**, `core/db.ts`:

- uma transação interativa por requisição, com o contexto da loja aplicado de forma local à transação;
- o cliente cru (`PrismaClient`, agrupador do `pg`) **nunca sai** de `db.ts`: o domínio recebe só o "punho" da transação (sem `$connect`, `$disconnect`, `$transaction`);
- casos de uso declaram **portas**; os `*.repo.ts` as implementam e são o único lugar com consulta;
- duas cadeias de conexão distintas (aplicação e migração) e credenciais separadas;
- alteração por identificador passa por `exigirUmaLinhaAfetada` (zero linhas vira "não encontrado", não sucesso silencioso).

## Consequências

- Bom: rota nova não consegue esquecer o isolamento; trocar o ORM mexe em um arquivo; SQL cru fica restrito e revisável.
- Ruim: dois estilos de consulta (Prisma e SQL) para aprender; o punho limitado esconde recursos do Prisma (ex.: `$transaction` aninhada).
- Dívida conhecida: o `order_items` do seed difere do gravado pela API (ver `docs/estruturacao/05-desempenho.md` §9).

## Evidência

- Isolamento entre lojas provado em `apps/api/tests/isolamento-entre-lojas-dono.test.ts` e `isolamento-varredura.test.ts`.
- `apps/api/src/core/db.test.ts` cobre o contexto por transação.
