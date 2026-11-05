# N+1 e chamadas redundantes com Prisma

Referência aprofundada da skill `banco-performance`. Leia quando o diff montar respostas com relações, iterar sobre resultados de query, ter vários Server Components buscando o mesmo dado, fazer polling, ou quando for preciso provar em teste quantas queries um request executa.

Em outro ORM (Drizzle, TypeORM, Sequelize), os padrões são os mesmos; TypeORM e Sequelize ainda têm lazy loading, que esconde N+1 atrás de um getter. Aplique o equivalente.

## 1. As formas do N+1

### 1.1 `await` no loop
```ts
// 1 + N queries, em série
const vendas = await prisma.venda.findMany({ where: { tenantId }, take: 50 });
for (const v of vendas) {
  const vendedor = await prisma.usuario.findUnique({ where: { id: v.vendedorId } });
}
```

### 1.2 `Promise.all` sobre `map`
```ts
// 1 + N queries, em paralelo: mais rápido em dev, mas cada request ocupa N conexões do pool
await Promise.all(vendas.map((v) => prisma.cliente.findFirst({ where: { id: v.clienteId, tenantId } })));
```
Paralelizar não resolve N+1; só troca latência por pressão no pool.

Nuance: o Prisma agrupa automaticamente chamadas `findUnique` disparadas no mesmo tick com o mesmo formato de consulta (é o que evita N+1 em resolvers GraphQL). Isso não vale para `findFirst`, `findMany`, `count` nem para chamadas em série. Não dependa desse agrupamento em código de serviço; escreva a query em lote.

### 1.3 Componente de lista que busca o próprio dado
```tsx
// Server Component por item: 50 itens = 50 queries
async function LinhaPedido({ pedido }: { pedido: PedidoResumo }) {
  const cliente = await prisma.cliente.findFirst({ where: { id: pedido.clienteId, tenantId: pedido.tenantId } });
  return <tr>...</tr>;
}
```
Busque os dados da lista no componente pai (ou no loader da página) de uma vez e passe por props.

### 1.4 Resolver ou serializer por campo
Em GraphQL, um resolver de campo (`Venda.cliente`) é chamado por item. Use DataLoader por request (ou o agrupamento de `findUnique` citado acima).

### 1.5 Regra de negócio em loop
```ts
// validação que consulta o banco item a item
for (const item of carrinho.itens) {
  const produto = await prisma.produto.findFirst({ where: { id: item.produtoId, tenantId } });
  if (!produto || produto.estoqueAtual < item.quantidade) throw new EstoqueInsuficiente(item.produtoId);
}
```
Carregue todos os produtos do carrinho em uma query e valide em memória.

## 2. Correções

### 2.1 `include`/`select` aninhado
```ts
const vendas = await prisma.venda.findMany({
  where: { tenantId },
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  take: 50,
  select: {
    id: true,
    totalCentavos: true,
    createdAt: true,
    vendedor: { select: { id: true, nome: true } },
    itens: { select: { quantidade: true, precoUnitarioCentavos: true, produto: { select: { nome: true } } } },
  },
});
```
Como o Prisma executa: por padrão, uma query por nível de relação, usando `WHERE ... IN (...)` com os ids do nível anterior. O número de queries depende da profundidade, não da quantidade de linhas. Versões recentes oferecem `relationLoadStrategy: 'join'` (preview `relationJoins` em várias versões), que resolve tudo em uma query com joins; confirme a versão do projeto e meça antes de adotar.

Cuidado: `include` sem limite em relação 1:N grande (cliente com 20 mil vendas) traz tudo. Relação aninhada também aceita `take`, `where` e `orderBy`.

### 2.2 Buscar em lote e combinar com `Map`
Útil quando os dados vêm de fontes diferentes, de outro módulo ou de um serviço externo.
```ts
const vendas = await prisma.venda.findMany({ where: { tenantId }, take: 50, select: { id: true, clienteId: true, totalCentavos: true } });

const clienteIds = [...new Set(vendas.map((v) => v.clienteId).filter((id): id is string => id !== null))];
const clientes = await prisma.cliente.findMany({
  where: { tenantId, id: { in: clienteIds } },
  select: { id: true, nome: true },
});
const clientePorId = new Map(clientes.map((c) => [c.id, c]));

return vendas.map((v) => ({ ...v, cliente: v.clienteId ? clientePorId.get(v.clienteId) ?? null : null }));
```
- Deduplicar ids antes do `IN`.
- Manter o filtro de `tenantId` também na segunda query.
- Listas muito grandes em `IN` (dezenas de milhares) indicam que o problema é outro: paginação ou processamento em lote.

### 2.3 Contagens por relação
```ts
// errado: count por produto
for (const p of produtos) p.totalVendas = await prisma.itemVenda.count({ where: { produtoId: p.id } });

// certo
const produtos = await prisma.produto.findMany({
  where: { tenantId },
  take: 50,
  select: { id: true, nome: true, _count: { select: { itens: true } } },
});
```
Para somas e agregações por grupo: `groupBy` com `by`, `_sum`, `where` e `in`, uma query só.

### 2.4 Validação de carrinho em lote
```ts
const ids = [...new Set(carrinho.itens.map((i) => i.produtoId))];
const produtos = await tx.produto.findMany({
  where: { tenantId, id: { in: ids }, deletedAt: null },
  select: { id: true, precoCentavos: true, estoqueAtual: true },
});
const porId = new Map(produtos.map((p) => [p.id, p]));
for (const item of carrinho.itens) {
  const p = porId.get(item.produtoId);
  if (!p) throw new ProdutoNaoEncontrado(item.produtoId);
  if (p.estoqueAtual < item.quantidade) throw new EstoqueInsuficiente(item.produtoId);
}
```
A baixa de estoque continua protegida por update condicional ou CHECK no banco; a validação em memória é para mensagem de erro, não para garantir concorrência (ver `backend-engenharia`).

## 3. Chamadas redundantes

N+1 é o caso extremo. Há outros desperdícios comuns, que não aparecem como loop.

### 3.1 Mesmo dado buscado por várias partes do request
Next.js App Router: `layout`, `page`, `generateMetadata` e componentes filhos buscam a sessão, o tenant ou o produto de forma independente. A deduplicação automática do Next vale para `fetch`, não para Prisma.

```ts
// src/modules/catalogo/infra/obter-produto.ts
import { cache } from 'react';

export const obterProduto = cache(async (tenantId: string, id: string) =>
  prisma.produto.findFirst({ where: { tenantId, id, deletedAt: null }, select: { id: true, nome: true, precoCentavos: true } }),
);
```
- `cache()` memoiza por request no servidor (RSC). Não é cache entre requests.
- Argumentos primitivos; objetos novos a cada chamada não batem na memoização.
- Em Express/Route Handler, passe o objeto já carregado adiante (parâmetro do use case) ou use um contexto por request.

### 3.2 Checar existência e buscar de novo
```ts
// errado: 2 queries
if (!(await prisma.cliente.findFirst({ where: { id, tenantId }, select: { id: true } }))) throw new NaoEncontrado();
const cliente = await prisma.cliente.findFirst({ where: { id, tenantId } });

// certo: 1 query
const cliente = await prisma.cliente.findFirst({ where: { id, tenantId }, select: { id: true, nome: true } });
if (!cliente) throw new NaoEncontrado();
```

### 3.3 Buscar para depois atualizar
```ts
// errado: leitura desnecessária antes de um update simples
const c = await prisma.cliente.findFirst({ where: { id, tenantId } });
if (!c) throw new NaoEncontrado();
await prisma.cliente.update({ where: { id }, data: { nome } });

// certo: update filtrado por tenant; count 0 = não encontrado
const { count } = await prisma.cliente.updateMany({ where: { id, tenantId }, data: { nome } });
if (count === 0) throw new NaoEncontrado();
```
Quando precisar do registro atualizado para a resposta, use `update` com `select` (retorna o registro) com a checagem de tenant garantida por unique composto (`where: { tenantId_id: { tenantId, id } }`) ou equivalente do projeto.

### 3.4 Recarregar o que acabou de ser gravado
`create`, `update` e `upsert` retornam o registro. Use o retorno (com `select`) em vez de um `findUnique` logo depois.

### 3.5 find + create em vez de upsert
```ts
// errado: 2 queries e condição de corrida (dois requests criam o mesmo)
let tag = await prisma.tag.findFirst({ where: { tenantId, nome } });
if (!tag) tag = await prisma.tag.create({ data: { tenantId, nome } });

// certo: 1 operação, protegida pela unique (tenant_id, nome)
const tag = await prisma.tag.upsert({
  where: { tenantId_nome: { tenantId, nome } },
  create: { tenantId, nome },
  update: {},
});
```

### 3.6 Pedir ao banco o que o front já tem
- Após uma mutation, devolva a entidade atualizada e atualize o cache do cliente (`setQueryData` no TanStack Query) em vez de invalidar e recarregar a lista inteira, quando a lista for cara.
- Não recarregue no servidor dados de exibição que o front enviou apenas para contexto.
- Exceção obrigatória: preço, desconto, permissão, saldo e estoque são sempre relidos no servidor (o valor do cliente não é confiável; ver `backend-seguranca`).

### 3.7 Contagem separada da página
```ts
// errado: duas queries, e COUNT(*) caro em tabela grande
const [itens, total] = await Promise.all([prisma.venda.findMany({ where, take: 50 }), prisma.venda.count({ where })]);

// certo quando a UI só precisa de "próxima página"
const linhas = await prisma.venda.findMany({ where, orderBy, take: 51 });
const temProxima = linhas.length > 50;
const itens = linhas.slice(0, 50);
```

### 3.8 Polling agressivo
- Intervalo curto (1 a 5 s) em tela aberta o dia inteiro, multiplicado por lojas e caixas, vira carga constante no banco.
- Alternativas: SSE ou WebSocket para eventos; intervalo maior com `refetchOnWindowFocus`; consulta delta (`updated_at > :ultimaSincronizacao`) com índice.
- Se o polling ficar, a query dele precisa ser a mais barata possível (índice, `select` mínimo) e cacheável.

### 3.9 Consultas escondidas em infraestrutura
- Callback de sessão (NextAuth/Auth.js) ou middleware que consulta o banco a cada request, inclusive assets.
- Prisma Client extension que faz leitura extra em toda operação.
- Carregar configuração do tenant em cada chamada de repository. Memoize por request ou cache com TTL e invalidação (ver `backend-performance`).

## 4. Provar em teste o número de queries

Teste de integração (Testcontainers) que fixa o teto de queries de uma operação. Se alguém introduzir N+1, o teste quebra.

```ts
// test/helpers/contador-queries.ts
import { PrismaClient } from '@prisma/client';

export function criarPrismaComContador() {
  const prisma = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
  let total = 0;
  prisma.$on('query', (e) => {
    if (!/^(BEGIN|COMMIT|ROLLBACK|DEALLOCATE)/i.test(e.query)) total++;
  });
  return {
    prisma,
    zerar: () => { total = 0; },
    total: () => total,
  };
}
```
```ts
it('[CA-2] lista 50 vendas com itens e vendedor em no máximo 4 queries', async () => {
  const { prisma, zerar, total } = contador;
  await semearVendas(prisma, { tenantId, quantidade: 50, itensPorVenda: 3 });
  zerar();

  const resultado = await listarVendas({ prisma, tenantId }, { take: 50 });

  expect(resultado.itens).toHaveLength(50);
  expect(total()).toBeLessThanOrEqual(4);
});
```
- O teto deve ser independente da quantidade de linhas: rode com 5 e com 50 registros e compare; se crescer, é N+1.
- Ajuste o import do client e a criação do `PrismaClient` ao padrão do projeto (versões recentes do Prisma usam driver adapter e caminho de client gerado configurável).

## 5. Checklist rápido ao revisar um diff

1. Há `await` de Prisma dentro de `for`, `for...of`, `forEach`, `map`, `reduce`?
2. Há `Promise.all(lista.map(... prisma ...))`?
3. Algum componente de item de lista chama o banco?
4. O mesmo `findFirst`/`findUnique` aparece duas vezes no caminho do request (layout, page, metadata, service)?
5. Há `count` + `findMany` com o mesmo `where` numa listagem grande?
6. Há leitura logo antes de `update`/`delete` só para checar existência?
7. Há leitura logo depois de `create`/`update` do mesmo registro?
8. Há `findFirst` + `create` onde cabe `upsert` com unique?
9. Há polling novo? Qual o intervalo e o custo da query?
10. Existe teste que trava o número de queries da operação quente?
