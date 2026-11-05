# Prisma: armadilhas de segurança

Referência aprofundada da skill `backend-seguranca`. Leia sempre que o diff usar Prisma com dado vindo de fora (body, query, params, headers, payload de fila/webhook) ou devolver objetos do Prisma ao cliente.

Cada item traz: o problema, um exemplo de ataque e a correção. Em outro ORM (Drizzle, TypeORM, Sequelize, Knex), os mesmos padrões existem com outros nomes; aplique o equivalente.

## 1. `undefined` no filtro significa "sem filtro"

No Prisma, uma chave com valor `undefined` em `where` é ignorada. Um filtro de segurança que chega vazio some silenciosamente.

```ts
// errado: se session.tenantId vier undefined (bug de sessão, rota pública), apaga produtos de TODOS os tenants
await prisma.produto.deleteMany({ where: { tenantId: session.tenantId, ativo: false } });

// errado: e-mail ausente no body → findFirst sem filtro → devolve o primeiro usuário do banco
const usuario = await prisma.usuario.findFirst({ where: { email: body.email } });
```

Correção:
- Contexto de autorização tipado como obrigatório (`tenantId: string`, nunca `string | undefined`) e produzido por `exigirSessao()`, que lança se faltar.
- Entrada validada com Zod antes de chegar à query (`z.string().email()` não aceita ausente).
- Em Prisma 5.20+, avalie ativar `strictUndefinedChecks` (preview): `undefined` explícito passa a gerar erro e "omitir de propósito" usa `Prisma.skip`.
- Em `updateMany`/`deleteMany`, trate `count` inesperadamente alto como sinal de bug.

## 2. Injeção de operadores via `where`

Se um objeto do cliente chega ao `where`, o atacante escolhe o operador. Com o parser `qs` (padrão `extended` do Express 4), `?email[not]=x` vira `{ email: { not: 'x' } }`. Com JSON no body, qualquer estrutura é possível.

```ts
// errado
const usuario = await prisma.usuario.findFirst({ where: { email: req.query.email, tokenReset: req.query.token } });
// ataque: ?email=vitima@x.com&token[not]=  → token "diferente de vazio" casa com qualquer token

// errado: filtro genérico repassado → vazamento por relação (ORM leak)
const produtos = await prisma.produto.findMany({ where: req.body.filtro });
// ataque: { "criadoPor": { "passwordHash": { "startsWith": "$argon2id$v=19$m=65536,t=3,p=4$a" } } }
// respondendo "tem resultado / não tem", o atacante extrai o hash caractere a caractere
```

Correção:
- Todo valor usado em `where` passa por schema que só aceita primitivos (`z.string()`, `z.coerce.number()`).
- Filtros dinâmicos são construídos pelo servidor a partir de uma lista fechada de campos e operadores.
```ts
const FiltroProdutos = z.object({
  nome: z.string().max(100).optional(),
  categoriaId: z.string().uuid().optional(),
  ativo: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
}).strict();

const f = FiltroProdutos.parse(req.query);
const where: Prisma.ProdutoWhereInput = {
  tenantId: ctx.tenantId,
  ...(f.nome && { nome: { contains: f.nome, mode: 'insensitive' } }),
  ...(f.categoriaId && { categoriaId: f.categoriaId }),
  ...(f.ativo !== undefined && { ativo: f.ativo }),
};
```
- No Express 4, considere `app.set('query parser', 'simple')` se o projeto não precisa de objetos na query. O Express 5 já usa `simple` por padrão.

## 3. Mass assignment em `data`, incluindo nested writes

`data` aceita campos escalares **e operações em relações**. Repassar o body permite muito mais que trocar `role`.

```ts
// errado
await prisma.pedido.update({ where: { id, tenantId }, data: req.body });
// ataques possíveis no body:
// { "status": "pago" }                                   → pula o pagamento
// { "totalCentavos": 1 }                                 → muda o valor
// { "tenant": { "connect": { "id": "outro-tenant" } } }  → move o registro de tenant
// { "itens": { "deleteMany": {} } }                      → apaga todos os itens do pedido
```

Correção: schema `.strict()` por operação e objeto `data` montado explicitamente.
```ts
const EditarPedido = z.object({ observacao: z.string().max(500) }).strict();
const { observacao } = EditarPedido.parse(req.body);
await prisma.pedido.update({ where: { id, tenantId: ctx.tenantId }, data: { observacao } });
```
Spread de objeto validado (`data: { ...parsed }`) é aceitável apenas quando o schema contém exatamente os campos editáveis.

## 4. SQL raw

| API | Seguro com dado externo? |
|---|---|
| `` prisma.$queryRaw`... ${valor}` `` | Sim: valores viram parâmetros |
| `` prisma.$executeRaw`... ${valor}` `` | Sim |
| `Prisma.sql` e `Prisma.join` compondo um `$queryRaw` | Sim |
| `prisma.$queryRawUnsafe(str, ...params)` com valores só em `params` | Sim, mas evite: fácil de regredir |
| `$queryRawUnsafe`/`$executeRawUnsafe` com interpolação na string | **Não** |
| `Prisma.raw(str)` com dado externo | **Não** |

```ts
// lista IN parametrizada
const ids = input.ids; // validados como uuid
const linhas = await prisma.$queryRaw<{ id: string; estoque: number }[]>`
  SELECT id, estoque FROM produto
  WHERE tenant_id = ${ctx.tenantId} AND id IN (${Prisma.join(ids)})`;

// composição condicional
const filtroNome = f.nome ? Prisma.sql`AND nome ILIKE ${'%' + escaparLike(f.nome) + '%'}` : Prisma.empty;
await prisma.$queryRaw`SELECT id, nome FROM produto WHERE tenant_id = ${ctx.tenantId} ${filtroNome}`;
```

Identificadores (coluna, direção de ordenação) não podem ser parâmetros. Use mapa fechado:
```ts
const COLUNAS_ORDENACAO = { nome: Prisma.sql`nome`, preco: Prisma.sql`preco_centavos`, criado: Prisma.sql`criado_em` } as const;
const DIRECOES = { asc: Prisma.sql`ASC`, desc: Prisma.sql`DESC` } as const;
const { ordem, direcao } = z.object({
  ordem: z.enum(['nome', 'preco', 'criado']).default('criado'),
  direcao: z.enum(['asc', 'desc']).default('desc'),
}).parse(req.query);
await prisma.$queryRaw`SELECT id, nome FROM produto WHERE tenant_id = ${ctx.tenantId}
  ORDER BY ${COLUNAS_ORDENACAO[ordem]} ${DIRECOES[direcao]} LIMIT 50`;
```

`escaparLike`: escape `%`, `_` e `\` do termo do usuário. Não é injeção, mas evita que `%` vire busca total cara.
```ts
const escaparLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
```

Toda query raw precisa do filtro de tenant escrito à mão: extensões de client não a alcançam.

## 5. `orderBy` e `select`/`include` dinâmicos

- `orderBy: { [req.query.campo]: 'asc' }` permite ordenar por campo oculto (`passwordHash`, `custoCentavos`) e inferir valores pela ordem. Use `z.enum` com campos permitidos.
- `select`/`include` montados a partir do cliente ("sparse fieldsets") precisam de lista fechada; caso contrário o cliente pede `include: { usuario: true }` e recebe o hash.

## 6. Exposição excessiva de dados

```ts
// errado: include traz todas as colunas do usuário, incluindo passwordHash e tokens
const venda = await prisma.venda.findFirst({ where: { id, tenantId }, include: { operador: true } });
return Response.json(venda);

// certo
const venda = await prisma.venda.findFirst({
  where: { id, tenantId: ctx.tenantId },
  select: {
    id: true, totalCentavos: true, criadaEm: true,
    operador: { select: { id: true, nome: true } },
  },
});
```
- Defina selects nomeados reutilizáveis (`vendaPublicaSelect`) com `satisfies Prisma.VendaSelect`.
- Segunda linha: `omit` global no client para campos que nunca devem sair (GA no Prisma 6.2; em 5.13-6.1 exige a preview `omitApi`).
```ts
export const prisma = new PrismaClient({
  omit: { usuario: { passwordHash: true, mfaSegredo: true } },
});
```
- **RSC e Server Actions também serializam para o cliente**: passar o objeto Prisma inteiro como prop de Client Component, ou retorná-lo de uma Server Action, envia todos os campos ao navegador. Monte DTO antes.

## 7. `connect`, `connectOrCreate` e `upsert` entre tenants

- `connect: { id: input.categoriaId }` não verifica tenant. Valide a posse antes ou use FK composta `(tenantId, id)`.
- `connectOrCreate`/`upsert` com chave única **global** (ex.: `sku @unique`) podem atualizar ou ligar o registro de outro tenant. Unicidade de negócio deve ser composta: `@@unique([tenantId, sku])`, e o `where` usa `tenantId_sku`.
```ts
await prisma.produto.upsert({
  where: { tenantId_sku: { tenantId: ctx.tenantId, sku: input.sku } },
  create: { tenantId: ctx.tenantId, sku: input.sku, nome: input.nome, precoCentavos: input.precoCentavos },
  update: { nome: input.nome, precoCentavos: input.precoCentavos },
});
```

## 8. Mensagens de erro e logs

- `PrismaClientValidationError` e alguns erros conhecidos trazem na mensagem trechos da query e **valores dos argumentos**. Nunca devolva `err.message` ao cliente; o error handler central traduz para Problem Details genérico.
- `new PrismaClient({ log: ['query'] })` e o evento `query` (`e.query`, `e.params`) registram parâmetros: e-mails, hashes, tokens. Desligue em produção ou redija `params`.
- `DATABASE_URL` contém senha: nunca logue a config inteira nem a inclua em erro.

## 9. Conexão e credenciais

- `DATABASE_URL` com TLS (`sslmode=require` ou `verify-full` quando houver CA).
- Usuário da aplicação sem permissão de DDL; migrations rodam com outro usuário (ver `banco-seguranca-operacao`).
- `prisma migrate reset` e `prisma db push --accept-data-loss` nunca apontam para produção; o pipeline usa `prisma migrate deploy`.

## 10. Checklist de grep para o revisor

| Buscar no diff | Por quê |
|---|---|
| `Unsafe(` | SQL raw com possível interpolação |
| `Prisma.raw(` | identificador/trecho SQL não parametrizado |
| `data: req.body`, `data: body`, `data: input` sem schema estrito, `...req.body` | mass assignment |
| `where: req.query`, `where: body.`, `where: filtro` vindo do cliente | injeção de operadores |
| `findUnique({ where: { id` sem `tenantId` | IDOR |
| `updateMany`/`deleteMany` com valor que pode ser `undefined` | filtro some |
| `include: {` retornado ao cliente | exposição excessiva |
| `connect: { id: input` | ligação entre tenants |
| `err.message` em resposta | vazamento de query/valores |
| `log: ['query']` | parâmetros sensíveis em log |
