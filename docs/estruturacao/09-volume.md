# Estruturação 9 — Volume: 100 mil pedidos sintéticos e EXPLAIN ANALYZE

Card #138 · executado em 20/11/2026 · pedido do curso: **"banco com volume: pelo menos 100 mil pedidos sintéticos"**. Depende de `04-simulacao.md` (seed do #135: 100 lojas e 1.000 pedidos) e alimenta o card de desempenho (#131) com o "antes" dos planos.

> **Só na `simpleclick_simulacao`.** O volume nunca escreve em `simpleclick_dev` (dados reais, preview do usuário) nem na base de teste. A guarda é única (`seed/volume/guarda.ts`) e soma-se à D-2 do #135. Detalhes na seção 5.

## 1. O que já existia, o que era parcial e o que faltava

**Já existia (reaproveitado, sem edição):**

| Peça | Onde |
|---|---|
| Guarda D-2 (produção, host local, banco ≠ dev/teste) e URLs dos papéis | `seed/simulacao/banco.ts:159` (`montarAlvo`), `:211` (`conectarConferindo`), `:51` (marcador do banco) |
| As 100 lojas, as datas de aprovação (20 a 29 dias antes da referência) | `seed/simulacao/perfil.ts:603` |
| Transições de status do núcleo (cópia local) | `seed/simulacao/transicoes.ts` (`proximosStatusDoPedido`) |
| Varredura de saídas (e-mail, prefixo de telefone, token de 40 hex, JWT, cookie) | `seed/simulacao/validar.ts:101` (`varrerSaidas`) |
| IDs e tokens determinísticos | `seed/deterministico.ts` (`idDeExemplo`, `tokenDeExemplo`) |
| Numeração por loja, índices do painel/cliente/token e RLS | `migrations/0008_pedidos.sql` (`store_sequences`, `orders_painel_idx:184`, `orders_do_cliente_idx:189`) |
| As consultas quentes da API (fontes copiadas) | `orders/quadro.usecase.ts:129,151`, `orders/fila.usecase.ts:64`, `customers/historico.usecase.ts:62`, `orders/acompanhar.usecase.ts:41`, `storefront/catalogo-paginado.usecase.ts:133,284`, `migrations/0029_operacao_do_pedido.sql:91` |

**Parcial (só o modelo foi aproveitado):** `plantarPedidos` (`seed/demo/index.ts:982`) insere linha a linha e usa a convenção de itens do seed; serviu de mapa de colunas, não de gerador. `atualizarTotaisDosClientes` e `garantirConta` **não** foram reusadas (tocam clientes do #135; `garantirConta` faz upsert, desbloqueia a conta e grava aceites legais permanentes).

**Faltava (criado aqui):** perfil de volume, carga em lote, validador próprio só SQL, catálogo de consultas com EXPLAIN sanitizado, este documento.

## 2. Comandos

Todos a partir da raiz, com o `.env` da raiz. `--semente` e `--referencia` são obrigatórios e sem padrão; a referência precisa de fuso.

| Comando | O que faz |
|---|---|
| `pnpm --filter @simpleclick/database seed:volume carregar --semente sc-2026 --referencia 2026-11-01T18:00:00-03:00` | pré-voo → carga (uma transação por loja) → espera do autoanalyze → validação → EXPLAIN |
| `… carregar … --ensaio` | carrega a 1ª loja, confere as 13 invariantes **dentro da transação** e faz ROLLBACK; recontagem prova que nada ficou |
| `… carregar … --falhar-na-loja N` | erro induzido depois dos INSERTs e antes do COMMIT (prova o rollback da loja inteira; usado nos testes) |
| `… validar …` | só leitura (`BEGIN READ ONLY`), sem HTTP e sem login |
| `… explicar …` | EXPLAIN (ANALYZE, BUFFERS) como `sc_app`, sempre `READ ONLY` |

Códigos de saída: **0** sucesso · **2** parâmetros, guarda ou pré-condição · **3** falha induzida · **1** erro de execução ou divergência. Saídas em `seed/volume/saida/` (ignorada pelo git): `carga*.json`, `baseline.json`, `validacao.json`, `autoanalyze.json`, `relatorio.md` e `explain/` (um `.json` e um `.txt` por cenário e loja).

## 3. O perfil

- **+100.000 pedidos** nas 100 lojas do #135 (total **101.000**), de **390 a 2.220 por loja** (o limite do perfil é 200 a 4.000), pesos determinísticos por SHA-256 da semente, resto pela maior fração.
- **Janela fixa [referência − 19 dias, referência)**. Como as lojas são aprovadas 20 a 29 dias antes, nenhum pedido é anterior à loja. Nenhum evento é posterior à referência. 90 % dos pedidos caem no horário comercial local (10h–22h, UTC-3).
- **Status coerente:** os 10 últimos pedidos de cada loja ficam **em andamento nas 6 h anteriores à referência** (a fila nunca fica vazia); os demais terminam em COMPLETED (88 %) ou CANCELLED (12 %). O histórico sempre começa em PENDING, encadeia transições permitidas pelo núcleo e termina no status do pedido; `accepted_at`, `completed_at`, `cancelled_at` e `updated_at` são os instantes dos eventos.
- **Numeração:** `number` 1011 a 1010+N por loja (código `A-1011`…), na ordem cronológica **dentro do volume**; a sequência (`kind='order'`) avança para 1010+N no mesmo commit.
- **Clientes sintéticos:** `max(30, ⌈N/6⌉)` por loja (16.709 no total), nomes e endereços fictícios, 30 % com e-mail `.test`, telefones fictícios. Uma identidade sintética **sem senha e sem aceite legal** liga-se ao cliente mais frequente de 5 lojas (usada só como `current_user_id` no EXPLAIN de `meus_pedidos`; nenhuma sessão, login ou credencial foi criada).
- **Itens:** 1 a 3 por pedido, quantidade 1 a 3, a partir dos itens dos 10 pedidos-base de cada loja (produto, variante e opções são FKs reais; sem faixa de atacado). Todos os pedidos são `channel ONLINE`.
- **Reprodutível:** mesmos `semente`, `referência` e base dão o mesmo hash do plano (`b0224d6390c1644c…`, 100.000 pedidos, 100 lojas).

## 4. Convenções de `order_items`: o que o volume imitou e o que difere

O #131 achou (`05-desempenho.md` §9, item 2) que o seed e a API gravam itens de forma diferente. Como o EXPLAIN e a reconciliação ficariam distorcidos, **o volume imita o checkout da vitrine**. Há, na verdade, quatro convenções no código:

| Origem | `unit_price_cents` | `options_total_cents` | `line_total_cents` | `price_delta_cents` da opção |
|---|---|---|---|---|
| **Volume e checkout da vitrine** (`orders/pedidos.routes.ts:691`, teste `apps/api/tests/carrinho-rota.int.test.ts:837-845`) | produto + acréscimo **por unidade** | acréscimo por unidade | `unit × quantidade` | **0** |
| Seed do #135 (`seed/demo/index.ts`, `plantarPedidos`) | produto sem opções | acréscimo **por linha** | `unit × qtd + options_total` | acréscimo da opção |
| Pedido manual do painel (`orders/pedido-manual.usecase.ts:282`) | grava o acréscimo real na opção | — | — | acréscimo real |
| `orders/snapshot.ts:171` (`congelarItem`, não usado no checkout) | produto sem opções | por unidade | `(unit + options) × qtd` | — |

Nenhuma `CHECK` do banco garante a fórmula: **só as checagens do volume** a defendem. A validação reconcilia o volume pela fórmula do checkout e a base do #135 pela do seed (um teste com quantidade ≥ 2 e acréscimo > 0 prova que as duas se distinguem nos dois sentidos). O `seed:simulacao:validar` do #135 reprova pedidos do checkout; a diferença continua pendente para quem decidir alinhar o seed com a API.

> **Achado na base do #135 (não alterada):** o seed grava `completed_at`/`cancelled_at` **um passo depois** do evento correspondente no histórico (pedidos 1007 a 1010 de cada loja). Por isso a validação confere esses carimbos só no volume.

## 5. Segurança e guarda

- Nome do banco **exato** `simpleclick_simulacao` (o padrão do #135 aceita sufixos), marcador `simpleclick-simulacao` no comentário do banco, `current_database()` a cada conexão.
- Camadas do #135 mantidas: `NODE_ENV` ≠ produção, host só local, banco ≠ `DATABASE_URL`/`DATABASE_URL_DIRETA`/`DATABASE_URL_TEST`.
- Somadas: recusa qualquer query string na URL, a porta do agrupador (6432) e as variáveis `PGOPTIONS`, `PGHOST`, `PGHOSTADDR`, `PGDATABASE`, `PGSERVICE`; `search_path` fixo.
- **Só dois papéis:** `sc_admin` (grava) e `sc_app` (EXPLAIN); ambos sem superusuário, sem `BYPASSRLS` e sem pertencer a outro papel (conferido a cada conexão). **Sem** superusuário, sem `sc_migrator`, sem `ANALYZE` manual, sem DDL/GRANT/`DISABLE TRIGGER`/`session_replication_role`/`row_security`. As constraints e a RLS ficaram ativas. A RLS não isola a carga (a política de `sc_admin` é `USING (true)`): o isolamento entre lojas é provado pela validação (filhos e clientes na mesma loja do pedido).
- **Trava advisory** `(8310138, 1)` numa conexão dedicada, **antes** do pré-voo; o pré-voo recusa outra sessão conectada à base (`client backend`, excluídas as próprias) e qualquer base fora do estado do #135 (sequência em 1010, 10 pedidos-base por loja).
- Erros do banco **nunca** são impressos: só etapa e código SQLSTATE. Saídas sanitizadas por igualdade dos valores ligados + padrões (token, e-mail, telefone, JWT); se algo sobrar, o arquivo não é gravado. Os planos publicados aqui passaram pela mesma varredura.

## 6. Resultados desta execução (semente `sc-2026`, referência `2026-11-01T18:00:00-03:00`)

Máquina local (Apple M4, 16 GB), PostgreSQL 16 em contêiner.

| Etapa | Resultado |
|---|---|
| **Ensaio** (`--ensaio`) | loja 000 (867 pedidos) carregada e conferida em 2,7 s e **desfeita**: ROLLBACK, recontagem voltou ao estado inicial (total 6,3 s com o pré-voo) |
| **Carga contínua do zero** | **100.000 pedidos + 16.709 clientes em 90,0 s** (pré-voo 7,4 s + carga 82,2 s), cerca de 1.200 pedidos/s; 100 transações, de 200 ms a 2,2 s por loja |
| Impressão da base do #135 | idêntica antes e depois (`41529613a81f6b79…`): os 1.000 pedidos originais, seus filhos e seus clientes não mudaram |
| **Reexecução** | **sem efeito**: 0 inseridos, 100.000 já existiam (lojas completas puladas), 2,8 s |
| Autoanalyze | as 6 tabelas de pedido já estavam analisadas pelo autovacuum ao fim da carga |
| **Validação** | **APROVADA**: 101.000 pedidos (1.000 base + 100.000 volume), 13 invariantes SQL com 0 violação, amostra de 1.000 pedidos do volume (recalculados e comparados com o plano) e 1.000 da base, 0 divergência |
| EXPLAIN | 11 cenários por loja (menor e maior do volume), todos com linhas > 0, duas passagens, e 10 provas negativas de RLS aprovadas |

Contagem por loja (LEFT JOIN a partir das 100 lojas): cada loja tem 10 pedidos-base e o esperado do plano (390 a 2.220); a lista completa está em `saida/validacao.json`.

**Tamanho das tabelas** (`pg_relation_size`, `pg_indexes_size`, `pg_total_relation_size`):

| tabela | linhas (estimativa) | dados (MB) | índices (MB) | total (MB) |
|---|---:|---:|---:|---:|
| orders | 101.000 | 40,5 | 124,1 | 164,7 |
| order_items | 167.284 | 76,6 | 52,8 | 129,4 |
| order_item_options | 97.373 | 16,8 | 14,6 | 31,4 |
| order_status_history | 472.471 | 65,9 | 99,4 | 165,4 |
| order_contacts | 101.000 | 17,2 | 16,6 | 33,8 |
| store_customers | 17.309 | 5,9 | 6,9 | 12,8 |

Nota: os índices de `orders` (124 MB) pesam três vezes os dados; é o primeiro lugar para olhar quando o card de desempenho falar de escrita.

### O que deu errado na execução e foi corrigido

1. **Duas invariantes SQL eram lentas** (181 s e mais de 17 min nos 100 mil pedidos): subconsultas correlacionadas por pedido com `OR NOT EXISTS`. Reescritas como semi-joins/agregações em conjunto: hoje 8 a 202 ms cada.
2. **Sessões órfãs:** ao interromper o cliente durante a validação, a consulta continuou rodando no servidor (o cluster do contêiner `postgres-dev`, que é o mesmo do preview, chegou a ~220 % de CPU). Encerrei, com `pg_terminate_backend`, **só** as duas sessões `sc_admin` da base `simpleclick_simulacao`; as do preview (`sc_app`, `simpleclick_dev`) não foram tocadas. Lição: nunca matar o cliente no meio de uma consulta pesada; deixar o `statement_timeout` agir.
3. A validação comparava os carimbos de data também na base do #135 e reprovou 400 pedidos (ver o achado da seção 4); corrigido para conferi-los só no volume.

## 7. EXPLAIN (ANALYZE, BUFFERS) das consultas quentes (para o "antes" do #131)

Medido como a aplicação mede: `sc_app`, `BEGIN READ ONLY`, os seis `set_config(..., true)` de `aplicarContextoNaTransacao`, `statement_timeout` 60 s, `lock_timeout` 5 s, ROLLBACK. Dados da **maior loja do volume** (2.220 pedidos), passada 2. A passada 2 **não prova cache frio**: o cache do PostgreSQL e do sistema podem estar quentes nas duas.

| Cenário | Consulta | Linhas | Tempo (ms) | Nó principal / índice |
|---|---|---:|---:|---|
| Quadro, dia da referência | `quadro-do-dia` | 71 | 0,14 | Bitmap Heap Scan em `orders` + `orders_por_periodo_idx` |
| Quadro, dia de pico | `quadro-do-dia` | 135 | 0,19 | idem |
| Quadro "hoje" simulado (com pendências) | `quadro-de-hoje` | 71 | 0,20 | BitmapOr de duas varreduras em `orders_por_periodo_idx` |
| Fila do painel | `fila` | 16 | 0,40 | Bitmap Index Scan em `orders_store_code_uk` (lê todos os pedidos da loja e filtra o status; 444 buffers) |
| Histórico do cliente | `historico-pedidos` | 46 | 0,16 | Index Scan em `orders_do_cliente_idx` |
| Pedido pelo token | `token-pedido` | 1 | 0,01 | Index Scan em `orders_public_token_uk` |
| Catálogo (resumo e página) | `catalogo-resumo`/`-pagina` | 8 | 0,12 / 0,18 | `product_categories_por_categoria…` (catálogo pequeno: 8 produtos por loja) |
| Conta do cliente (chamada) | `app.meus_pedidos` | **167** | **2.339,69** | **Function Scan** (o plano interno fica escondido) |
| Conta do cliente (corpo, como `sc_admin`) | corpo de `app.meus_pedidos` | **167** | **2.464,30** | **Seq Scan em `orders` e um Seq Scan em `order_items` por pedido retornado** |

Todas as demais consultas-filhas (contatos, itens, opções, histórico do pedido, loja pelo token) ficam abaixo de 0,4 ms, com índices (`order_items_do_pedido_idx`, `order_item_options_do_item_idx`, `order_status_history_do_pedido_idx`, `order_contacts_pkey`). Os planos completos e sanitizados de cada cenário e loja estão em `saida/explain/*.txt` e `*.json`; o trecho decisivo (corpo de `meus_pedidos`, passada 1):

```
Gather Merge (tempo real=83.285..2306.64 linhas=167)   Buffers: shared hit=1135957 read=506277
  -> Hash Join
       -> Seq Scan em orders (linhas=33667 voltas=3)
       -> Index Scan em store_customers usando store_customers_identidade_ix
            Index Cond: (identity_id = (NULLIF(current_setting('app.user_id'), ''))::uuid)
  -> Aggregate (voltas=167)
       -> Seq Scan em order_items  Filter: (order_id = o.id)  Rows Removed by Filter: 167282
Execution Time: 2408.127 ms
```

### Provas negativas de RLS (todas aprovadas)

Dono da loja A não enxerga os pedidos da B (e vice-versa); token inexistente, token de outra loja e ausência de token não leem pedido; cliente alheio não enxerga pedidos em `meus_pedidos`; o papel PUBLIC não usa `meus_pedidos`. Cada prova tem seu controle positivo (o mesmo contexto lê o que é seu).

## 8. Propostas para o card de desempenho (nada foi aplicado)

Este card não altera migrações nem a API. As propostas abaixo são só texto.

**P1 — `app.meus_pedidos` (o único ponto lento; sem índice novo).** Os dois índices envolvidos começam por `store_id` (`orders_do_cliente_idx (store_id, store_customer_id, placed_at DESC)` e `order_items_do_pedido_idx (store_id, order_id) INCLUDE …`), mas o corpo da função não filtra por loja nas duas junções, então o planejador faz Seq Scan em `orders` e um Seq Scan em `order_items` por linha. Nova migração com `CREATE OR REPLACE FUNCTION` acrescentando `AND c.store_id = o.store_id` na junção com `store_customers` e `AND i.store_id = o.store_id` na contagem de itens. **Prova de hipótese (EXPLAIN somente leitura da consulta corrigida, nada aplicado):** o mesmo resultado de 167 linhas em **1,6 a 6,9 ms** (contra 2.408 ms), com `store_customers_identidade_ix` + `orders_do_cliente_idx` + Index Only Scan em `order_items_do_pedido_idx`. A mesma correção vale para o plano de `meus_pedidos(p_order_id)`.

**P2 — fila do painel (hipótese, ainda sem prova).** Hoje usa `orders_store_code_uk` só para achar as linhas da loja e filtra `status NOT IN ('COMPLETED','CANCELLED')`, lendo 444 buffers para 16 linhas na maior loja; o custo cresce com o histórico da loja. Candidato: índice parcial `ON app.orders (store_id, placed_at, number) WHERE status NOT IN ('COMPLETED','CANCELLED')` com `INCLUDE` das colunas da fila. **Não medido** (este card não cria índice): o card de desempenho deve medir antes e depois; com 2 mil pedidos por loja o ganho absoluto é de décimos de ms.

**Não mexer:** o quadro, o histórico, o token e o catálogo já estão em índices e em menos de 0,4 ms.

## 9. Limites desta medição

- **SQL equivalente, não capturado.** As consultas de fonte Prisma (quadro, fila, histórico, token) foram reescritas à mão (mesmo select, where, ordem e limite; relações como uma consulta por tabela filha, com os ids reais da consulta pai). **Não** é o SQL que o Prisma envia: a captura por `DEBUG` foi descartada porque registraria tokens e erros completos em arquivo. Fontes em SQL cru (dia da loja, catálogo, `meus_pedidos`, loja do token) foram copiadas literalmente. Cada plano em `saida/explain` declara a origem (`literal` ou `equivalente`) e a fonte `arquivo:linha`.
- **Data real × referência.** `now()` do servidor não é a referência do dataset. O ramo "hoje" do quadro (pendências de dias anteriores) foi medido com instantes fixos derivados da referência, rotulado como equivalente parametrizado; o dia real em que o EXPLAIN roda não entra.
- **Catálogo pequeno:** 8 produtos por loja; o volume não amplia o catálogo, então o EXPLAIN do catálogo não sofre com volume de produtos.
- **`app.meus_pedidos` é `SECURITY DEFINER`:** a chamada aparece como Function Scan; por isso o corpo foi medido à parte como `sc_admin` (que contorna só a RLS, não a lógica da função).
- **Duas passagens não são cache frio.**
- **Retomada após queda** foi provada por teste com conexão falsa (erro no 3º INSERT, falha induzida) e pela reexecução real, em que as 100 lojas completas foram puladas; **não** houve uma queda real no meio da carga.
- **A trava advisory não cobre `seed:simulacao`:** o `--recriar` do #135 apaga a base (`DROP DATABASE … WITH (FORCE)`) sem pegar a trava (e a trava é por banco). O pré-voo recusa outras sessões e o volume só deixa lojas completas, mas um `--recriar` no meio da carga a derrubaria. Proposta ao #135: o `--recriar` consultar `pg_locks` (`classid = 8310138`) antes do DROP. Não editei `seed/simulacao`.
- **Depois do volume, `seed:simulacao:validar` reprova por projeto** (ele espera 10 pedidos por loja e 1.000 no total, e faz login HTTP). Vale o `seed:volume validar`. O k6 do #131 não é afetado (usa um Postgres descartável, `05-desempenho.md`).

## 10. Voltar ao estado do #135

Só por `pnpm --filter @simpleclick/database seed:simulacao -- --semente sc-2026 --referencia 2026-11-01T18:00:00-03:00 --recriar`, que apaga e recria a base (guardado pelo #135: todas as lojas `SIM-` e o marcador), **decidido por uma pessoa e com a base sem outros usuários**. Nunca há `DELETE` manual: o `sc_admin` nem tem esse privilégio nas tabelas de pedido. Uma loja interrompida no meio é desfeita pela própria transação; as confirmadas ficam e a reexecução as pula.

## 11. Verificações do card

| Comando | Resultado |
|---|---|
| `pnpm --filter @simpleclick/database typecheck` | ✅ sem erros |
| `pnpm exec eslint packages/database/seed/volume/` | ✅ 0 erros (13 avisos de tamanho de função e aninhamento, como no #135) |
| `pnpm vitest run --project db-rls packages/database/seed/volume/` | ✅ ver o relatório do card (testes com conexão falsa: a fábrica real nunca é chamada nas recusas; o setup do `db-rls` cria um banco de teste descartável por arquivo, e os testes do volume não usam a `simpleclick_simulacao`) |
| Execução real na `simpleclick_simulacao` | ✅ ensaio, carga, reexecução sem efeito, validação e EXPLAIN |

## 12. Pendências (para o gerente)

- Incluir este documento no índice `docs/estruturacao/README.md` (fora dos arquivos reservados deste card).
- Avisar o #135 do risco do `--recriar` concorrente (seção 9) e de que o `seed:simulacao:validar` passa a reprovar a base com volume.
- O card de desempenho deve partir de `saida/explain/` e de `baseline.json` (impressão da base e hash do plano) e decidir P1 e P2.
