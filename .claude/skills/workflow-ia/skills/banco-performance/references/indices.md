# Índices no PostgreSQL com Prisma

Referência aprofundada da skill `banco-performance`. Leia quando for criar, alterar ou remover índice, escolher tipo e ordem de colunas, ou declarar índices no `schema.prisma`.

Princípio: índice existe para uma consulta concreta. Comece pela query (WHERE, JOIN, ORDER BY, LIMIT) e desenhe o índice para ela; confirme com `EXPLAIN (ANALYZE, BUFFERS)` (ver [explain-analyze.md](explain-analyze.md)).

## 1. Quando criar

Crie quando:
- A tabela cresce sem limite (vendas, itens, movimentos, logs) e a query filtra uma fração pequena dela.
- A query está em rota quente ou roda com muita frequência (`pg_stat_statements`).
- A coluna é FK usada em join, filtro ou em `DELETE`/`UPDATE` do pai.
- É preciso garantir unicidade (índice único é a própria constraint).

Não crie quando:
- A tabela é pequena e limitada (planos, configurações, formas de pagamento de um tenant).
- A coluna tem baixa seletividade e é usada sozinha (`ativo`, `status` com 3 valores): prefira índice parcial ou composto.
- Já existe índice cujo prefixo cobre a query.
- "Pode ser útil um dia". Cada índice custa em todo INSERT/UPDATE/DELETE, ocupa disco e memória e pode impedir HOT updates.

## 2. B-tree e ordem das colunas

O B-tree composto funciona como lista telefônica ordenada por (sobrenome, nome): serve para buscar por sobrenome, ou sobrenome + nome, mas não só por nome.

Regras de ordem:
1. Colunas comparadas por igualdade primeiro (`tenant_id = $1`, `status = 'ABERTA'`).
2. Depois, a coluna de range ou de ordenação (`created_at >= $2`, `ORDER BY created_at DESC`).
3. Só uma coluna de range aproveita bem o índice; demais condições de range viram filtro.
4. Direção importa quando há múltiplas colunas com direções mistas no `ORDER BY` (`created_at DESC, id DESC` é atendido por `(created_at DESC, id DESC)` ou pelo scan reverso de `(created_at, id)`; `created_at DESC, id ASC` precisa de índice com direções equivalentes).

Exemplos:

| Query | Índice |
|---|---|
| `WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50` | `(tenant_id, created_at DESC)` |
| `WHERE tenant_id = $1 AND status = 'ABERTA' ORDER BY created_at` | `(tenant_id, status, created_at)` ou parcial `(tenant_id, created_at) WHERE status = 'ABERTA'` |
| `WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3` | `(tenant_id, created_at)` |
| `WHERE tenant_id = $1 AND sku = $2` | único `(tenant_id, sku)` |
| Keyset `WHERE tenant_id = $1 AND (created_at, id) < ($2, $3) ORDER BY created_at DESC, id DESC` | `(tenant_id, created_at DESC, id DESC)` |
| `WHERE tenant_id = $1 AND venda_id = $2` (itens da venda) | `(tenant_id, venda_id)` |

Multi-tenant: praticamente toda query começa por `tenant_id = $1`, então quase todo índice começa por `tenant_id`. Um índice só em `created_at` obriga o banco a ler dados de todos os tenants.

## 3. FKs sem índice

O PostgreSQL cria índice para PK e UNIQUE, não para FK. Sem índice na coluna da FK:
- Joins do filho a partir do pai fazem varredura.
- `DELETE`/`UPDATE` da PK do pai varre o filho inteiro para checar a FK.

Encontrar FKs sem índice que as cubra (aproximação: verifica se as colunas da FK estão no início de algum índice):
```sql
SELECT c.conrelid::regclass AS tabela, c.conname AS fk, pg_get_constraintdef(c.oid) AS definicao
FROM pg_constraint c
WHERE c.contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid
      AND (i.indkey::int2[])[0:cardinality(c.conkey) - 1] @> c.conkey
  )
ORDER BY 1;
```

## 4. Índice parcial

Indexa só as linhas que a query consulta. Menor, mais rápido, mais barato de manter.
```sql
-- listagens ignoram excluídos
CREATE INDEX CONCURRENTLY clientes_tenant_nome_ativos_idx ON clientes (tenant_id, nome) WHERE deleted_at IS NULL;

-- fila de trabalho: poucas linhas pendentes num mar de processadas
CREATE INDEX CONCURRENTLY outbox_pendentes_idx ON outbox (created_at) WHERE processado_em IS NULL;

-- unicidade condicional
CREATE UNIQUE INDEX CONCURRENTLY caixas_loja_aberto_key ON caixas (tenant_id, loja_id) WHERE fechado_em IS NULL;
```
A query precisa conter a mesma condição (ou uma que a implique) para o planner usar o índice. Com Prisma, garanta que o filtro `deletedAt: null` está sempre presente.

## 5. INCLUDE e Index Only Scan

`INCLUDE` guarda colunas extras nas folhas do índice, sem participar da ordenação. Permite `Index Only Scan` (não visita a tabela).
```sql
CREATE INDEX CONCURRENTLY produtos_tenant_sku_cover_idx
  ON produtos (tenant_id, sku) INCLUDE (nome, preco_centavos) WHERE deleted_at IS NULL;
```
Use só em consulta muito quente (leitura de código de barras no PDV). O índice fica maior, e o ganho depende de a tabela estar bem vacuumizada (`Heap Fetches` baixo).

## 6. Índice de expressão e consultas "sargáveis"

Função aplicada à coluna no `WHERE` impede o uso de índice comum.
```sql
-- query: WHERE tenant_id = $1 AND lower(email) = lower($2)
CREATE INDEX CONCURRENTLY clientes_tenant_email_lower_idx ON clientes (tenant_id, lower(email));
```
A query precisa usar exatamente a mesma expressão. Alternativa mais simples com Prisma: coluna `email_normalizado` preenchida pela aplicação, com índice comum ou único.

Datas: em vez de `WHERE date(created_at) = '2026-09-29'`, converta os limites do dia (no fuso da loja) para UTC na aplicação e use range:
```sql
WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3
```
Isso usa `(tenant_id, created_at)` sem índice de expressão.

## 7. Busca textual

### 7.1 `contains` / `ILIKE '%x%'` com pg_trgm
O filtro `contains` (com ou sem `mode: 'insensitive'`) do Prisma vira `LIKE`/`ILIKE '%x%'`. B-tree não ajuda; trigram sim.
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY produtos_nome_trgm_idx ON produtos USING gin (nome gin_trgm_ops);
```
- Funciona para `LIKE`, `ILIKE` e regex; termos com menos de 3 caracteres aproveitam mal o índice. Exija mínimo de 3 caracteres na busca.
- Para combinar com `tenant_id` no mesmo índice GIN, é preciso a extensão `btree_gin`: `USING gin (tenant_id, nome gin_trgm_ops)`. Sem ela, o planner combina o índice trigram com o índice de tenant via bitmap, o que costuma bastar.
- Prisma declara índice trigram assim (se a extensão estiver habilitada no banco):
  ```prisma
  @@index([nome(ops: raw("gin_trgm_ops"))], type: Gin, map: "produtos_nome_trgm_idx")
  ```

### 7.2 Full-text
Para busca por palavras, com radical e ranking (descrição de produto, observações):
```sql
ALTER TABLE produtos ADD COLUMN busca tsvector
  GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(nome, '') || ' ' || coalesce(descricao, ''))) STORED;
CREATE INDEX CONCURRENTLY produtos_busca_idx ON produtos USING gin (busca);
```
```ts
const termo = entrada.q; // validado com Zod (string, 1 a 100 caracteres)
const produtos = await prisma.$queryRaw<{ id: string; nome: string }[]>`
  SELECT id, nome
  FROM produtos
  WHERE tenant_id = ${tenantId}::uuid
    AND deleted_at IS NULL
    AND busca @@ websearch_to_tsquery('portuguese', ${termo})
  ORDER BY ts_rank(busca, websearch_to_tsquery('portuguese', ${termo})) DESC
  LIMIT 20`;
```
- `$queryRaw` com template literal é parametrizado; nunca `$queryRawUnsafe` com concatenação.
- Adicionar coluna gerada `STORED` reescreve a tabela: em tabela grande, siga expand/contract (ver `banco-modelagem`).
- Acentos: `unaccent` não é `IMMUTABLE` e não pode ser usado direto em coluna gerada ou índice; a solução usual é uma função wrapper imutável com dicionário explícito. Avalie com cuidado ou normalize o texto na aplicação.

## 8. jsonb

```sql
-- consultas por contenção: atributos @> '{"tecido": "linho"}'
CREATE INDEX CONCURRENTLY produtos_atributos_idx ON produtos USING gin (atributos jsonb_path_ops);

-- um caminho específico usado em igualdade
CREATE INDEX CONCURRENTLY produtos_atributos_colecao_idx ON produtos ((atributos ->> 'colecao'));
```
Os filtros JSON do Prisma nem sempre geram o operador que o índice atende; confirme com `EXPLAIN`. Se o campo é filtrado com frequência, promova a coluna (ver `banco-modelagem`).

## 9. BRIN para séries temporais grandes

Tabelas append-only muito grandes, com linhas inseridas em ordem de tempo (auditoria, eventos, logs), podem usar BRIN: índice minúsculo que guarda faixas por bloco.
```sql
CREATE INDEX CONCURRENTLY auditoria_created_brin ON auditoria USING brin (created_at);
```
Bom para "eventos do último mês" em tabelas de centenas de milhões de linhas; ruim para buscar poucas linhas específicas ou quando a ordem física não acompanha o tempo.

## 10. Declarar no Prisma

```prisma
model Venda {
  // ...
  @@index([tenantId, createdAt(sort: Desc)], map: "vendas_tenant_created_idx")
  @@index([tenantId, status, createdAt])
  @@index([tenantId, clienteId])
  @@unique([tenantId, numero])
}
```
- `sort: Desc`, `type: Gin | Gist | Brin | Hash`, `ops` e `map` são suportados no PostgreSQL.
- Índice parcial e `INCLUDE`: em geral só via SQL na migration (verifique se a versão do Prisma do projeto passou a suportar). Documente com `///` no modelo e confirme que `prisma migrate diff` não tenta removê-lo.
- `@@index` gera `CREATE INDEX` sem `CONCURRENTLY`. Para tabela grande em produção, edite a migration gerada (com `--create-only`) para usar `CONCURRENTLY`, sozinha em sua própria migration (ver `banco-modelagem`, migrations).

## 11. Criar, reconstruir e remover em produção

- Criar: `CREATE INDEX CONCURRENTLY IF NOT EXISTS ...`. Não bloqueia escrita, demora mais, não roda em transação.
- Falha no meio deixa índice inválido:
  ```sql
  SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
  -- DROP INDEX CONCURRENTLY <nome>; e recrie
  ```
- Reconstruir índice inchado: `REINDEX INDEX CONCURRENTLY <nome>;` (PG12+).
- Remover: `DROP INDEX CONCURRENTLY IF EXISTS <nome>;`.
- Depois de criar, `ANALYZE <tabela>` se as estatísticas estavam desatualizadas.

## 12. Encontrar índices sem uso e o tamanho deles

```sql
SELECT s.relname AS tabela,
       s.indexrelname AS indice,
       s.idx_scan AS usos,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS tamanho
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.idx_scan = 0
  AND NOT i.indisunique
  AND NOT i.indisprimary
ORDER BY pg_relation_size(s.indexrelid) DESC;
```
Antes de remover:
- Estatísticas contam desde o último reset; confirme há quanto tempo (`pg_stat_database.stats_reset`).
- Réplicas de leitura têm contadores próprios: um índice sem uso no primário pode servir relatórios na réplica.
- Índices que sustentam constraint (unique, PK) ficam, mesmo com zero uso.

Duplicados: um índice `(tenant_id)` é redundante quando existe `(tenant_id, created_at)`. Liste por tabela e compare:
```sql
SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname;
```

## 13. Custo de escrita e HOT updates

- Todo índice é atualizado em INSERT, em DELETE (via vacuum) e em UPDATE que muda coluna indexada.
- UPDATE que não muda nenhuma coluna indexada pode ser HOT (não toca índices). Indexar `updated_at` ou `estoque_atual` em tabela com muitos updates elimina esse benefício. Só indexe colunas de alta mutação se houver query que precise.
- Tabela de alta escrita (movimentos de estoque, eventos) deve ter o mínimo de índices.

## 14. Revisão de um índice novo: perguntas

1. Qual query ele atende? Está no diff ou na spec?
2. As colunas de igualdade vêm antes das de range/ordenação? Começa por `tenant_id`?
3. Já existe índice que cobre essa query (prefixo)?
4. Deveria ser parcial (`deleted_at IS NULL`, status específico)?
5. Tabela grande em produção? Então `CONCURRENTLY`, migration própria.
6. Há `EXPLAIN` antes/depois em volume realista?
7. A coluna muda com frequência? O ganho de leitura compensa o custo de escrita?
8. Está declarado no `schema.prisma` (ou documentado com `///`, se o Prisma não expressar)?
