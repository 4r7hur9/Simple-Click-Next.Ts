# Lendo EXPLAIN (ANALYZE, BUFFERS) no PostgreSQL

Referência aprofundada da skill `banco-performance`. Leia quando precisar medir uma query, entender por que está lenta, comparar o plano antes e depois de um índice, ou achar as queries que mais custam em produção.

## 1. Como rodar

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;
```

Opções úteis:
- `ANALYZE`: executa de verdade e mostra tempos e linhas reais. Sem ele, só estimativas.
- `BUFFERS`: páginas de 8 kB lidas do cache (`hit`) ou do disco/SO (`read`). É a medida de trabalho mais estável; tempo varia com cache e carga.
- `VERBOSE`: colunas de saída de cada nó.
- `SETTINGS`: parâmetros de planner fora do padrão.
- `FORMAT JSON`: para colar em visualizadores (explain.dalibo.com, explain.depesz.com). Não cole planos com dados pessoais em serviço externo; anonimize literais.
- `GENERIC_PLAN` (PG16+): mostra o plano genérico de uma query com `$1`, `$2` sem executar.

Cuidados:
- `ANALYZE` executa a query. Para `INSERT`/`UPDATE`/`DELETE`, envolva em transação e desfaça:
  ```sql
  BEGIN;
  EXPLAIN (ANALYZE, BUFFERS) UPDATE produtos SET estoque_atual = estoque_atual - 1 WHERE tenant_id = '...' AND id = '...';
  ROLLBACK;
  ```
- Rode em volume realista. Em tabela com 200 linhas, o planner escolhe Seq Scan corretamente e o plano não diz nada sobre produção.
- Rode duas ou três vezes: a primeira costuma pagar cache frio (`read` alto). Compare `Buffers` além do tempo.
- Nunca rode `EXPLAIN ANALYZE` de DML em produção sem transação e `ROLLBACK`.

### Obter o SQL real que o Prisma gera
```ts
const prisma = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
prisma.$on('query', (e) => {
  console.log(e.query, e.params, `${e.duration}ms`);
});
```
Substitua `$1`, `$2` pelos valores de `e.params` para rodar o `EXPLAIN`. Use em dev/teste; em produção, logs de query podem conter dado pessoal.

Prepared statements: o Prisma usa parâmetros. Depois de algumas execuções, o PostgreSQL pode passar a usar um plano genérico, que ignora o valor concreto (importa em colunas com distribuição muito desigual, como um tenant gigante e muitos pequenos). Se o plano com literal for bom e o de produção ruim, compare com `EXPLAIN (GENERIC_PLAN)` e avalie `plan_cache_mode`.

## 2. Anatomia de uma linha

```
Index Scan using vendas_tenant_created_idx on vendas  (cost=0.56..90321.40 rows=101372 width=48) (actual time=0.039..0.201 rows=50 loops=1)
```

| Parte | Significado |
|---|---|
| `cost=0.56..90321.40` | Custo estimado de início..total, em unidades arbitrárias do planner. Serve para comparar planos, não é tempo |
| `rows=101372` (1º parêntese) | Linhas que o planner estima que o nó produz |
| `width=48` | Bytes médios por linha |
| `actual time=0.039..0.201` | Milissegundos até a primeira linha..até a última, por execução do nó |
| `rows=50` (2º parêntese) | Linhas reais produzidas, por execução |
| `loops=1` | Quantas vezes o nó executou. Tempo total do nó = `actual time` final x `loops` |

O plano é uma árvore: leia de dentro para fora (nós mais indentados executam primeiro e alimentam o pai). O tempo de um nó inclui o dos filhos.

Rodapé:
- `Planning Time`: tempo para planejar. Alto (dezenas de ms) em queries com muitos joins ou tabelas particionadas.
- `Execution Time`: tempo total de execução no servidor, sem rede nem serialização no cliente.

## 3. Nós mais comuns

### Acesso a tabela
| Nó | Quando é bom | Quando é problema |
|---|---|---|
| `Seq Scan` | Tabela pequena ou query que lê grande parte da tabela | Tabela grande com filtro seletivo; olhe `Rows Removed by Filter` |
| `Index Scan` | Filtro seletivo; também entrega ordem do índice | Muitas linhas com acesso aleatório à heap |
| `Index Only Scan` | Todas as colunas estão no índice; ideal para queries quentes | `Heap Fetches` alto: visibility map desatualizado (vacuum) |
| `Bitmap Index Scan` + `Bitmap Heap Scan` | Muitas linhas, ou combinação de índices (`BitmapAnd`/`BitmapOr`) | `Recheck Cond` com `lossy` blocks: `work_mem` baixo |

### Junções
| Nó | Característica | Sinal de problema |
|---|---|---|
| `Nested Loop` | Para cada linha de fora, busca na de dentro. Ótimo com poucas linhas externas e índice na interna | `loops` alto no nó interno sem índice (Seq Scan interno repetido) |
| `Hash Join` | Monta hash da menor tabela. Bom para conjuntos médios/grandes | `Batches` > 1 no `Hash`: não coube em `work_mem`, foi para disco |
| `Merge Join` | Duas entradas ordenadas | Sort caro antes para produzir a ordem |

### Outros
- `Sort`: veja `Sort Method`. `quicksort Memory` é ok; `top-N heapsort` é ok com `LIMIT`; `external merge Disk: 80000kB` indica ordenação em disco (índice que entregue a ordem, ou menos linhas).
- `Limit`: se o filho precisa processar tudo antes (Sort sem índice), o `LIMIT` não economiza.
- `Aggregate`/`HashAggregate`/`GroupAggregate`: agregações; `HashAggregate` com `Disk Usage` indica falta de memória.
- `Gather`/`Parallel Seq Scan`: paralelismo. Útil em relatório; em rota OLTP geralmente indica falta de índice.
- `Memoize` (PG14+): cache de resultados do lado interno de um Nested Loop.
- `SubPlan`: subconsulta executada por linha; confira `loops`.

## 4. Buffers

```
Buffers: shared hit=1203 read=18544 dirtied=0 written=0, temp read=0 written=0
```

| Campo | Significado |
|---|---|
| `shared hit` | Páginas encontradas no shared buffers (memória do Postgres) |
| `shared read` | Páginas que vieram do SO/disco. Alto em execução repetida = working set não cabe em memória |
| `dirtied`/`written` | Páginas sujas/escritas pela query (comuns em DML, ou leitura após muitas escritas por causa de hint bits) |
| `temp read/written` | Arquivos temporários: sort ou hash maiores que `work_mem` |

Regra prática: 1 página = 8 kB. `shared hit+read = 19747` são ~154 MB tocados para devolver 50 linhas. A meta de uma query de listagem OLTP é tocar dezenas ou poucas centenas de páginas.

## 5. Estimativa versus realidade

Compare `rows` estimado com `rows` real em cada nó. Diferença de 10x ou mais leva o planner a escolher join e acesso errados.

Causas e correções:
- Estatísticas velhas (depois de carga/backfill): `ANALYZE <tabela>;`.
- Colunas correlacionadas (`tenant_id` e `loja_id`, `cidade` e `uf`): `CREATE STATISTICS vendas_tenant_loja_stats (dependencies, ndistinct) ON tenant_id, loja_id FROM vendas; ANALYZE vendas;`.
- Distribuição muito desigual por tenant: aumentar alvo de estatística da coluna (`ALTER TABLE vendas ALTER COLUMN tenant_id SET STATISTICS 1000; ANALYZE vendas;`).
- Função ou expressão no `WHERE`: o planner chuta seletividade; índice de expressão também cria estatística para a expressão.

## 6. Exemplo completo: listagem de vendas do tenant

Query (gerada por `findMany` com `where tenantId`, `orderBy createdAt desc`, `take 50`):
```sql
SELECT id, numero, total_centavos, created_at
FROM vendas
WHERE tenant_id = '6f1c...'
ORDER BY created_at DESC
LIMIT 50;
```

Antes (só índice na PK):
```
Limit  (cost=48210.11..48210.23 rows=50 width=48) (actual time=412.301..412.315 rows=50 loops=1)
  Buffers: shared hit=1203 read=18544
  ->  Sort  (cost=48210.11..48463.54 rows=101372 width=48) (actual time=412.299..412.307 rows=50 loops=1)
        Sort Key: created_at DESC
        Sort Method: top-N heapsort  Memory: 32kB
        Buffers: shared hit=1203 read=18544
        ->  Seq Scan on vendas  (cost=0.00..44747.00 rows=101372 width=48) (actual time=0.021..371.442 rows=98211 loops=1)
              Filter: (tenant_id = '6f1c...'::uuid)
              Rows Removed by Filter: 1901789
              Buffers: shared hit=1203 read=18544
Planning Time: 0.210 ms
Execution Time: 412.370 ms
```
Leitura:
- `Seq Scan` com `Rows Removed by Filter: 1901789`: leu 2 milhões de linhas para usar 98 mil.
- `Buffers` ~19,7 mil páginas (~154 MB) para 50 linhas.
- O `Sort` precisou de todas as 98 mil linhas do tenant antes de aplicar o `LIMIT`.

Correção: `CREATE INDEX CONCURRENTLY vendas_tenant_created_idx ON vendas (tenant_id, created_at DESC);`

Depois:
```
Limit  (cost=0.56..45.12 rows=50 width=48) (actual time=0.041..0.212 rows=50 loops=1)
  Buffers: shared hit=54
  ->  Index Scan using vendas_tenant_created_idx on vendas  (cost=0.56..90321.40 rows=101372 width=48) (actual time=0.039..0.201 rows=50 loops=1)
        Index Cond: (tenant_id = '6f1c...'::uuid)
        Buffers: shared hit=54
Planning Time: 0.180 ms
Execution Time: 0.240 ms
```
Leitura:
- `Index Cond` usa o tenant; a ordem vem do índice, então não há `Sort`.
- O `Limit` para após 50 linhas: 54 páginas em vez de 19.747.
- Evidência para o pacote de provas: `Execution Time` 412 ms para 0,24 ms, `Buffers` 19.747 para 54, mesmo volume de dados.

## 7. Exemplo: Nested Loop multiplicando

```
Nested Loop  (actual time=0.05..1840.22 rows=5000 loops=1)
  ->  Index Scan using itens_venda_tenant_venda_idx on itens_venda i  (actual time=0.03..4.10 rows=5000 loops=1)
  ->  Seq Scan on produtos p  (actual time=0.12..0.36 rows=1 loops=5000)
        Filter: (id = i.produto_id)
        Rows Removed by Filter: 1999
```
- O nó interno executou 5.000 vezes (`loops=5000`) a ~0,36 ms: ~1,8 s no total.
- `Seq Scan` interno com filtro por id indica falta de índice utilizável (ou estimativa errada que fez o planner achar que era barato).
- Correção típica: índice que sirva o join (`produtos (tenant_id, id)` com a condição completa no join) e `ANALYZE` se a estimativa estava errada.

## 8. Sinais de alerta e ação

| Sinal no plano | Provável causa | Ação |
|---|---|---|
| `Seq Scan` + `Rows Removed by Filter` enorme | Falta índice para o filtro | Índice composto começando pelas colunas de igualdade |
| `Sort` antes de `Limit` em listagem | Índice não entrega a ordem | Índice com as colunas do `ORDER BY` após as de igualdade |
| `Sort Method: external merge` | Sort maior que `work_mem` | Reduzir linhas, índice para ordem; ajustar `work_mem` só para relatório |
| `Hash` com `Batches: 8` | Hash em disco | Menos linhas/colunas no lado do hash; `work_mem` por sessão de relatório |
| `loops` alto em nó interno | Nested Loop com acesso caro | Índice no lado interno; revisar estimativas |
| `rows` estimado muito diferente do real | Estatística ruim | `ANALYZE`, `CREATE STATISTICS`, alvo maior |
| `Heap Fetches` alto em Index Only Scan | Visibility map desatualizado | Vacuum mais agressivo na tabela |
| `Filter` com função na coluna (`lower(email)`) | Índice não usado | Índice de expressão ou coluna normalizada |
| `Index Scan` com `Filter` removendo muito | Índice atende só parte do filtro | Incluir a coluna no composto ou índice parcial |
| `Planning Time` > `Execution Time` em query simples | Muitas partições/joins ou estatísticas extensas | Revisar particionamento e joins |

## 9. pg_stat_statements: o que mais custa no total

Uma query de 5 ms chamada 2 milhões de vezes por dia custa mais que um relatório de 3 s chamado 10 vezes. Ordene por tempo total.

```sql
-- requer a extensão pg_stat_statements habilitada (shared_preload_libraries)
SELECT
  queryid,
  calls,
  round(total_exec_time)                 AS total_ms,
  round(mean_exec_time::numeric, 2)      AS media_ms,
  rows / NULLIF(calls, 0)                AS linhas_por_chamada,
  shared_blks_hit + shared_blks_read     AS paginas,
  left(query, 120)                       AS query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

Leitura:
- `calls` muito alto com `linhas_por_chamada` = 1: suspeita de N+1 na aplicação.
- `paginas` alto por chamada: falta índice ou leitura excessiva.
- Para comparar antes/depois de um deploy, `SELECT pg_stat_statements_reset();` em staging, rode a carga e consulte de novo.

## 10. Planos reais em produção: auto_explain e logs

- `log_min_duration_statement = '500ms'`: registra queries lentas. Os parâmetros podem conter dados pessoais; trate o log como sensível.
- `auto_explain` registra o plano de queries lentas:
  ```
  session_preload_libraries = 'auto_explain'
  auto_explain.log_min_duration = '500ms'
  auto_explain.log_analyze = on      -- tem custo; avalie amostragem com auto_explain.sample_rate
  auto_explain.log_buffers = on
  ```
- Em banco gerenciado, esses parâmetros são configurados no painel do provedor; confirme o que ele permite.

## 11. Roteiro de diagnóstico

1. Identifique a query (APM, `pg_stat_statements`, log do Prisma).
2. Reproduza com valores reais em volume realista.
3. `EXPLAIN (ANALYZE, BUFFERS)` duas vezes; use a segunda.
4. Ache o nó com maior tempo exclusivo (tempo do nó menos filhos, vezes `loops`).
5. Compare estimado com real nesse nó e nos filhos.
6. Hipótese (índice, reescrita, estatística), aplique em ambiente de teste, repita o `EXPLAIN`.
7. Registre antes/depois (tempo, buffers, plano) no pacote de provas.
