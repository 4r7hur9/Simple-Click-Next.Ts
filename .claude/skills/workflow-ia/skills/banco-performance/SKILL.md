---
name: banco-performance
description: "Performance do acesso a dados no PostgreSQL com Prisma: N+1 e chamadas redundantes ao banco, select só das colunas usadas, índices (FK, compostos, parciais, INCLUDE, expressão, pg_trgm), leitura de EXPLAIN (ANALYZE, BUFFERS), pg_stat_statements, paginação keyset, escrita em lote, transações curtas e ordem de lock, COUNT caro, views materializadas, réplica, autovacuum e particionamento. Use quando o diff criar ou alterar query Prisma ou SQL raw, where/orderBy/include, busca textual, listagem, relatório, @@index ou transação com muitas linhas. Não use para cache, event loop e I/O paralelo no Node (use backend-performance) nem para desenho de tabelas e constraints (use banco-modelagem)."
---

# Banco: performance e chamadas redundantes

Objetivo: cada request faz o menor número de queries possível, cada query usa um plano bom e lê só o necessário, e o banco continua saudável com crescimento de dados. O `implementer` e o `fixer` seguem "Regras" e "Como construir"; o `performance-reviewer` usa o "Checklist de revisão" e gera findings com a severidade padrão. A severidade sobe um nível em rota quente (PDV no caixa, listagem principal, login, webhook de pagamento) e desce um nível em rota administrativa rara ou tabela comprovadamente pequena e limitada.

Exemplos em PostgreSQL 15+ e Prisma. Em outro stack, aplique o equivalente.

## Regras inegociáveis

1. **Nenhuma query dentro de loop sobre resultado de outra query (N+1).** Cada iteração é um round-trip; 100 itens viram 101 queries e o p95 explode com o volume.
2. **Toda listagem tem `take` com teto no servidor e ordenação determinística.** Sem limite, um tenant grande traz 500 mil linhas; sem ordem estável, a paginação repete ou pula registros.
3. **`select` explícito com os campos usados; nada de `include` de relação inteira para ler um campo.** Colunas largas (texto, jsonb) e relações extras custam I/O, rede e memória.
4. **Query nova ou alterada em tabela que cresce tem índice que a sustenta, começando por `tenant_id`.** Seq Scan em `vendas` é invisível em dev e derruba produção.
5. **Toda coluna de FK usada em filtro ou join tem índice.** O PostgreSQL não cria índice em FK automaticamente; delete no pai e join viram varredura.
6. **Mudança de índice ou query crítica vem com `EXPLAIN (ANALYZE, BUFFERS)` antes/depois em volume realista.** Plano em tabela vazia não prova nada.
7. **Paginação de lista que cresce sem limite é keyset (cursor), não `OFFSET` alto.** `OFFSET 100000` lê e descarta 100 mil linhas a cada página.
8. **Busca `contains`/`ILIKE '%x%'` em tabela grande tem índice trigram ou full-text.** B-tree não serve para curinga no início; vira Seq Scan.
9. **Transação curta: sem chamada HTTP, fila, e-mail ou espera de usuário dentro dela.** Transação aberta segura locks e conexão do pool; o fornecedor lento trava o caixa.
10. **Locks de várias linhas são adquiridos em ordem consistente (ex.: ids ordenados).** Ordens diferentes em requests concorrentes geram deadlock.
11. **Escrita em massa usa lote (`createMany`, `updateMany`, SQL set-based), não `create` em loop.** N inserts em série multiplicam latência e WAL.
12. **O mesmo dado não é consultado duas vezes no mesmo request.** Checar existência e buscar de novo, ou recarregar o que já está em memória, é custo puro.
13. **Relatório e agregação pesada não rodam na rota quente contra a tabela transacional sem medição.** Use tabela de resumo, view materializada ou réplica.
14. **Índice só com consulta que o use; índice novo em tabela grande é criado `CONCURRENTLY`.** Cada índice custa em toda escrita; `CREATE INDEX` comum bloqueia escrita.

## Como construir

### Carregar relações sem N+1
- Prisma: `include`/`select` aninhado carrega a relação em lote (poucas queries com `IN`), não uma por linha.
- Dados de fontes diferentes: colete ids, uma query `where: { id: { in: ids } }`, monte `Map` e combine em memória.
- `_count` no `select` para contagens por relação, em vez de `count()` por item.
- Detalhes e detecção automática em [references/n-mais-1-e-chamadas-redundantes.md](references/n-mais-1-e-chamadas-redundantes.md).

### Índices
- Composto: colunas de igualdade primeiro (`tenant_id`, `status`), depois range ou ordenação (`created_at`).
- Parcial para subconjunto consultado (`WHERE deleted_at IS NULL`, `WHERE status = 'ABERTA'`).
- `INCLUDE` para Index Only Scan em consulta muito quente.
- Expressão para `lower(email)`, `date(created_at AT TIME ZONE ...)` se a query filtra pela expressão exata.
- GIN com `gin_trgm_ops` para `contains`/`ILIKE`; GIN em `tsvector` para full-text; GIN em `jsonb` para `@>`.
- Remova índices sem uso e duplicados (prefixo de outro composto).
- Guia completo em [references/indices.md](references/indices.md).

### Medir
- `EXPLAIN (ANALYZE, BUFFERS)` com dados em volume realista (seed de volume ou cópia anonimizada). Como ler: [references/explain-analyze.md](references/explain-analyze.md).
- `pg_stat_statements` para achar as queries com maior `total_exec_time`, não só as mais lentas individualmente.
- Em teste, conte queries por request com o log de eventos do Prisma e trave o número em teste de integração.
- `log_min_duration_statement` e `auto_explain` em staging/produção para capturar planos reais.

### Paginação e contagem
- Keyset: `WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT n`, com índice `(tenant_id, created_at DESC, id DESC)`.
- Prisma: `cursor` + `skip: 1` + `orderBy` com desempate único, ou `where` explícito com a condição de keyset.
- "Tem próxima página": busque `take + 1` em vez de `COUNT(*)`.
- Total exato só quando a UI exige; senão estimativa ou limite ("mais de 1.000").

### Escrita
- `createMany` (e `createManyAndReturn` quando a versão do Prisma suportar e você precisar dos ids).
- `updateMany`/`deleteMany` com `where` set-based; atualização de valores diferentes por linha em lote via SQL raw parametrizado (`UPDATE ... FROM (VALUES ...)`) quando o volume justificar.
- Operação atômica no banco (`increment`/`decrement`) em vez de ler, somar em JS e gravar.
- Import grande: lotes de 500 a 5.000 linhas, fora do request (fila).

### Transações e locks
- Interativa (`$transaction(async (tx) => ...)`) só com operações de banco; prepare dados e chame APIs externas antes ou depois (outbox para efeitos externos).
- Ajuste `timeout`/`maxWait` só com motivo; o padrão do Prisma (5 s / 2 s) serve de alarme.
- Ordene ids antes de `SELECT ... FOR UPDATE` ou de updates em várias linhas.
- Corretude de concorrência (qual lock usar) está em `backend-engenharia`; aqui o foco é duração e contenção.

### Relatórios e leitura pesada
- Tabela de resumo (por dia/loja) atualizada por job ou na escrita, reconstruível.
- `MATERIALIZED VIEW` com `REFRESH MATERIALIZED VIEW CONCURRENTLY` (exige índice único) em agenda.
- Réplica de leitura para relatórios (ex.: extensão `@prisma/extension-read-replicas`), aceitando atraso de replicação explícito na spec.

### Saúde do banco
- Pool: `instâncias x conexões por instância` abaixo de `max_connections` com folga; serverless com pooler (ver `backend-performance`).
- Autovacuum ativo; tabelas de alta escrita (movimentos de estoque, sessões) podem precisar de ajuste por tabela.
- `ANALYZE` após carga grande ou backfill para estatísticas corretas.
- Particionamento (por mês, por tenant) só para tabelas muito grandes com padrão de acesso por chave de partição e necessidade de descarte por período.

## Checklist de revisão

Valores exatos para o campo severidade dos findings: `urgente`, `alto`, `medio`, `baixo`.

| # | Verificação | Severidade padrão |
|---|---|---|
| 1 | Chamada HTTP externa, fila ou espera dentro de `$transaction` | alto |
| 2 | Query Prisma ou SQL dentro de `for`/`map`/`forEach` sobre resultado de query (N+1) em rota quente | alto |
| 3 | `findMany` sem `take` (ou com `take` vindo do cliente sem teto) em tabela que cresce | alto |
| 4 | Filtro/ordenação nova em tabela grande sem índice correspondente (ou índice sem `tenant_id` à frente) | alto |
| 5 | FK nova usada em join/filtro sem índice na coluna | alto |
| 6 | `contains`/`ILIKE '%x%'`/`startsWith` insensitive em tabela grande sem índice trigram ou full-text | alto |
| 7 | `CREATE INDEX` sem `CONCURRENTLY` em tabela grande de produção | alto |
| 8 | `create`/`update` em loop para dezenas ou mais de linhas em vez de lote | alto |
| 9 | Updates/locks em várias linhas sem ordem consistente (risco de deadlock) | alto |
| 10 | Agregação pesada (`groupBy`, `SUM` em meses de vendas) na rota quente sem resumo/cache/medição | alto |
| 11 | `skip`/`OFFSET` em listagem que cresce sem limite (feed, histórico de vendas) | medio |
| 12 | `COUNT(*)` exato em toda página de listagem grande | medio |
| 13 | `include` de relação inteira ou sem `select` quando só alguns campos são usados | medio |
| 14 | Mesma query executada mais de uma vez no request (existência + busca, recarregar objeto em mão) | medio |
| 15 | Leitura + cálculo em JS + gravação onde cabe operação atômica (`increment`, `UPDATE ... SET x = x - n`) | medio |
| 16 | Função aplicada à coluna no `WHERE` (`lower(email) = ...`, `date(created_at) = ...`) sem índice de expressão | medio |
| 17 | Ordem das colunas do índice composto contraria o padrão da query (range antes de igualdade) | medio |
| 18 | Índice novo duplicado ou prefixo de índice existente | medio |
| 19 | Paginação sem desempate único no `orderBy` (ex.: só `createdAt`) | medio |
| 20 | Mudança de query/índice crítico sem EXPLAIN ou contagem de queries como evidência | medio |
| 21 | `$transaction` com `timeout` aumentado para acomodar trabalho lento em vez de tirá-lo da transação | medio |
| 22 | Backfill ou import em um único `UPDATE`/`INSERT` de milhões de linhas | medio |
| 23 | Polling do front consultando o banco em intervalo curto sem necessidade | medio |
| 24 | Índice em coluna de baixa seletividade sozinha (booleano, status com 3 valores) sem ser parcial | baixo |
| 25 | `N+1` em rota administrativa rara com volume limitado | baixo |
| 26 | Falta de `ANALYZE` documentado após carga/backfill grande | baixo |

## Anti-padrões (errado → certo)

### N+1 ao montar a resposta
```ts
// errado: 1 + N queries
const pedidos = await prisma.pedido.findMany({ where: { tenantId }, take: 50 });
const resposta = await Promise.all(
  pedidos.map(async (p) => ({ ...p, cliente: await prisma.cliente.findFirst({ where: { id: p.clienteId, tenantId } }) })),
);

// certo: relação em lote, só com o necessário
const pedidos = await prisma.pedido.findMany({
  where: { tenantId },
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  take: 50,
  select: { id: true, totalCentavos: true, createdAt: true, cliente: { select: { id: true, nome: true } } },
});
```

### Busca por existência e depois de novo
```ts
// errado: duas queries para o mesmo registro
const existe = await prisma.produto.count({ where: { id, tenantId } });
if (!existe) throw new NaoEncontrado();
const produto = await prisma.produto.findFirst({ where: { id, tenantId } });

// certo
const produto = await prisma.produto.findFirst({ where: { id, tenantId }, select: { id: true, nome: true, precoCentavos: true } });
if (!produto) throw new NaoEncontrado();
```

### OFFSET alto
```ts
// errado: página 2.000 lê e descarta 100 mil linhas
await prisma.venda.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, skip: pagina * 50, take: 50 });

// certo: keyset com desempate único; índice (tenant_id, created_at DESC, id DESC)
await prisma.venda.findMany({
  where: { tenantId },
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  take: 51, // 1 a mais para saber se há próxima página
  ...(cursor && { cursor: { id: cursor }, skip: 1 }),
});
```

### Escrita em loop
```ts
// errado: 800 round-trips
for (const linha of planilha) await prisma.produto.create({ data: { ...linha, tenantId } });

// certo: lotes
for (const lote of emLotes(planilha, 1000)) {
  await prisma.produto.createMany({ data: lote.map((l) => ({ ...l, tenantId })), skipDuplicates: true });
}
```

### Chamada externa dentro da transação
```ts
// errado: conexão e locks presos enquanto o gateway responde
await prisma.$transaction(async (tx) => {
  const venda = await tx.venda.create({ data });
  await gateway.capturar(venda.id, total); // 2 s, às vezes 30 s
  await tx.venda.update({ where: { id: venda.id }, data: { status: 'PAGA' } });
});

// certo: transação só com banco; efeito externo via outbox/fila
await prisma.$transaction(async (tx) => {
  const venda = await tx.venda.create({ data });
  await tx.outbox.create({ data: { tipo: 'CAPTURAR_PAGAMENTO', payload: { vendaId: venda.id } } });
});
```

## Referências

- [references/explain-analyze.md](references/explain-analyze.md) — leia quando precisar medir uma query, entender por que está lenta, comparar plano antes/depois de um índice ou usar `pg_stat_statements` e `auto_explain`.
- [references/n-mais-1-e-chamadas-redundantes.md](references/n-mais-1-e-chamadas-redundantes.md) — leia quando o diff montar respostas com relações, iterar sobre resultados, usar Server Components que buscam o mesmo dado, fazer polling ou quando precisar provar em teste o número de queries por request.
- [references/indices.md](references/indices.md) — leia quando for criar, alterar ou remover índice, escolher tipo (B-tree, GIN, BRIN), ordem de colunas, índice parcial/expressão/INCLUDE, ou declarar índices no `schema.prisma`.
