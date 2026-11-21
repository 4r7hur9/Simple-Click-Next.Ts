# Desempenho — plano de p95, gargalo, antes e depois (card #142)

O curso (M4) pede *plano de p95: cache com tolerância, idempotência da fila* e *k6 em 3 estágios e relatório com
gargalo, antes e depois*. Este documento entrega os dois, **só com números medidos**: cada valor abaixo sai de um
arquivo em [`docs/desempenho/`](desempenho/) (cópia saneada da saída do k6, da reconciliação com o banco e do
`EXPLAIN (ANALYZE, BUFFERS)`).

| O curso pede | Onde está |
|---|---|
| Plano de p95 por operação | [seção 1](#1-plano-de-p95-por-operação) |
| Cache com tolerância | [seção 2.1](#21-onde-há-cache-hoje-e-quanta-defasagem-cada-leitura-aceita) |
| Idempotência da fila | [seção 2.2](#22-idempotência-das-filas--o-mecanismo-real) |
| k6 em 3 estágios | [seção 3](#3-a-carga-k6-em-3-estágios-contra-101-mil-pedidos) |
| Gargalo (EXPLAIN ANALYZE) | [seção 4](#4-o-gargalo-appmeus_pedidos) |
| Antes e depois | [seção 5](#5-antes--depois) |

**Resultado em uma linha:** a lista "meus pedidos" da conta do cliente (`GET /v1/conta/pedidos`) era a única leitura
lenta com 101 mil pedidos na base. Uma migração (`0074_meus_pedidos_por_loja.sql`) acrescentou a loja nas duas
junções da função `app.meus_pedidos`. Sob a mesma carga, o p95 caiu de **481 ms** (588 e 374 nas duas execuções)
para **9 ms** (9 e 9), e a consulta de uma conta com 167 pedidos caiu de **~2,0 s** para **0,7 ms**. Nenhuma outra
operação piorou e a integridade dos pedidos ficou exata nas quatro execuções.

## 1. Plano de p95 por operação

As metas valem para o **ensaio de carga** (k6, `tests/performance/k6/carga.js`) e para **produção** (histograma
`http_request_duration_seconds` do `/metrics`, card #139). Em todas, **só contam respostas 2xx**
(`expected_response:true` no k6; `status_code=~"2.."` no Prometheus): os 4xx previstos (loja fechada, abaixo do
mínimo, preço divergente) e as requisições canceladas pelo cliente ficam fora, exatamente como no SLO.

| operação | rota (molde) | meta | o que conta | janela no ensaio | janela em produção |
|---|---|---|---|---|---|
| catálogo | `GET /v1/vitrine/:apelido/catalogo/resumo` e `/catalogo/produtos` | **p95 < 500 ms** | 2xx | a execução inteira da carga (8 min, 0→20 VUs) | 28 dias, bucket `le="0.5"` |
| criação do pedido | `POST /v1/vitrine/:apelido/pedidos` (201) | **p95 < 1.000 ms e p99 < 1.000 ms** | 2xx da primeira tentativa (op `criar`) | idem | 28 dias, bucket `le="1"` = o SLO |
| replay (mesma chave) | o mesmo `POST` devolvendo 200 `jaExistia` | **p95 < 500 ms** e **nenhum 5xx** | 2xx do replay (op `replay`); `erro500_replay == 0` | idem | entra no SLO junto com a criação |
| fila do painel | `GET /v1/lojas/:apelido/pedidos` | **p95 < 500 ms** | 2xx (dono logado, polling de ~5 s como o painel) | cenário `painel`, min 2–7 | 28 dias, bucket `le="0.5"` |
| meus pedidos (conta) | `GET /v1/conta/pedidos` | **p95 < 500 ms** | 2xx (cliente logado, lista exata da conta) | cenário `conta`, min 2–7, 5 req/s | 28 dias, bucket `le="0.5"` |

**Coerência com o SLO** (`docs/observabilidade.md`): o SLO declarado é *99% das criações válidas em menos de 1 s, em
28 dias*. A meta do ensaio para a criação é o mesmo limite no p99 (o p95 < 1 s é consequência). Com algumas centenas
de criações num ensaio de 8 min, o p99 do k6 é **indicativo**, não prova de conformidade: a conformidade é medida
pelo Prometheus em 28 dias. O replay conta como criação boa no SLO; no k6 ele tem meta própria (mais apertada,
porque não grava nada).

**Validade × metas.** O k6 sai com código 99 tanto quando uma meta de p95 falha quanto quando a integridade falha.
O resumo agora separa as duas coisas (`resumo.json`, chaves `validade` e `metasDeP95`):

- **validade** (tolerância zero, a execução só vale como medida se passar): `totais_errados`, `replay_divergente`,
  `erro500_replay`, `isolamento_violado`, `vazamento_painel`, `dropped_iterations{scenario:conta}`,
  `checks{essencial:sim} > 99%`, `falhas_inesperadas < 1%`, e a reconciliação com o banco;
- **metas** (podem falhar — é o "antes" esperado): os p95/p99 da tabela acima.

## 2. Cache com tolerância e idempotência das filas

### 2.1 Onde há cache hoje e quanta defasagem cada leitura aceita

| leitura | cache hoje | onde | defasagem máxima hoje | aceitável | por quê |
|---|---|---|---|---|---|
| vitrine, catálogo e produto (site) | `fetch` do Next com `revalidate: 60` e etiqueta `vitrine:<apelido>` | `apps/web/src/server/vitrine.ts:45,67,171,328`, `apps/web/src/server/produto.ts:100` | 60 s se o aviso de revalidação se perder; ~0 s com o aviso | **60 s** | preço e foto mudam pouco; o preço é reconferido no carrinho e na criação (409 `preco_divergente`), então a vitrine velha nunca cobra errado |
| invalidação da vitrine | a API avisa o site (`POST /api/revalidate`, 2 s de prazo, melhor esforço) depois de 2xx em `/v1/lojas/:apelido/{catalogo,configuracao,tema}` | `apps/api/src/core/aviso-ao-site.ts:62-65` | — | — | mudança de pedido de propósito NÃO invalida a vitrine |
| fechamento (taxas, mínimo, formas de pagamento) | `revalidate: 15` | `apps/web/src/server/fechamento.ts:36,52` | 15 s | **15 s** | a criação recalcula no servidor; o mínimo velho só muda a mensagem da tela |
| tipos de negócio, limites de mídia | `Cache-Control: public, max-age=300` (API) e `revalidate: 3600` no feed (site) | `apps/api/src/modules/feed/feed.routes.ts:98`, `apps/api/src/modules/catalog/midias.routes.ts:217`, `apps/web/src/server/feed.ts:141` | 5 min / 1 h | **1 h** | lista quase estática |
| métricas do painel do dono | Redis, TTL 60 s, chave com **marca-d'água** (`updated_at` do último pedido) | `apps/api/src/core/cache.ts` (`TTL_PADRAO_SEGUNDOS`), `apps/api/src/modules/metrics/cache.ts:27-35` | **0 s** para mudança de pedido (a marca troca a chave); 60 s é só a rede de proteção | 60 s | número agregado; a marca-d'água já invalida no primeiro pedido novo |
| fila do painel, quadro do dia, pedido pelo token, **meus pedidos** | **sem cache** (`cache-control: no-store`) | `apps/api/src/modules/orders/conta.routes.ts:91`, `fila.routes.ts` | 0 s | **0 s** | o status anda a cada passo da loja; o painel já faz polling de 5 s (`useQuadroDoDia.ts:27`) |

**Por que a otimização deste card não é cache:** a leitura lenta é `meus pedidos`, que tem defasagem aceitável **zero**
(a pessoa acompanha o pedido que acabou de fazer). Cache ali trocaria lentidão por pedido errado na tela. A correção
certa é a consulta (seções 4 e 5).

### 2.2 Idempotência das filas — o mecanismo real

**Criação do pedido (a "fila" de entrada).** Não é um cabeçalho `Idempotency-Key`: é o campo obrigatório
`chaveDeIdempotencia` (8–64 caracteres, `packages/contracts/src/carrinho.ts:326`), gerado pelo site uma vez por
tentativa de fechamento (`crypto.randomUUID()`). O banco garante a unicidade com
`orders_idempotency_uk (store_id, idempotency_key)` (`packages/database/migrations/0008_pedidos.sql:177`). A rota
procura a chave antes de numerar o pedido e devolve **200 `jaExistia: true`** com o pedido gravado; pedido novo é
**201**. A corrida de duas confirmações simultâneas (o defeito AC-516) foi corrigida no #134: a criação roda sob
`SAVEPOINT criar_pedido_idempotente`, e um `P2002` em `orders_idempotency_uk` (`ehCorridaDeIdempotencia`,
`apps/api/src/modules/orders/criar-pedido.usecase.ts:212`) volta ao savepoint (devolvendo o número consumido) e
responde com o pedido vencedor. Medido aqui: em todas as execuções, **0 duplicidade e 0 AC-516** na reconciliação
(seção 6).
Limites conhecidos: a chave **não expira** (o índice é permanente) e **não guarda impressão do corpo**: repetir a
chave com outro corpo devolve o pedido gravado com 200 em vez de recusar com 422. *Proposta:* gravar um hash do
corpo junto da chave e responder 422 quando divergir.

**Impressão automática (fila em Postgres, não BullMQ).** `app.print_jobs` com um índice único parcial
`print_jobs_pendente_por_pedido_uk (store_id, order_id) WHERE status IN ('QUEUED','LEASED','FAILED')`
(`packages/database/migrations/0034_fila_de_impressao.sql:162`): **no máximo um trabalho pendente por pedido**,
enfileirado dentro da transação do pedido por `app.enfileirar_impressao()` (`NOT EXISTS` + `ON CONFLICT DO NOTHING`).
O agente reivindica com `FOR UPDATE SKIP LOCKED` e prazo (*lease*); confirmar e falhar são `UPDATE` condicionados a
`status = 'LEASED'`; até 6 tentativas com espera exponencial (`MAXIMO_DE_TENTATIVAS`,
`apps/api/src/modules/printing/fila.usecase.ts:62`), depois `DEAD`. O agente consulta a cada 2,5 s
(`apps/agente-impressao/src/agente.ts:28`) e guarda em diário local os trabalhos já impressos, para uma confirmação
perdida não virar reimpressão.

**E-mail (BullMQ no Redis).** Única fila BullMQ com worker (`MOTOR_DAS_FILAS`, `apps/api/src/jobs/index.ts:69`):
prefixo `sc-filas`, 5 tentativas com espera exponencial, `removeOnFail: false` (`apps/api/src/jobs/fila.ts:111-114`).
**Não há `jobId` determinístico** (`apps/api/src/jobs/email.job.ts:219`): um reenvio do mesmo pedido de e-mail
enfileira um trabalho novo. O efeito é um e-mail repetido, não um dado errado. *Proposta:* `jobId =
<tipo>:<identidade>:<janela>` para o BullMQ descartar a duplicata.

**Mudança de status pelo painel.** Não há chave de idempotência, mas sim *compare-and-set*: `updateMany` com o
status lido e 409 se outra pessoa mudou antes (`apps/api/src/modules/orders/mudar-status.usecase.ts`). Repetir a
mesma transição devolve 409 `transicao_invalida`, não um 200 reaproveitado.

## 3. A carga: k6 em 3 estágios contra 101 mil pedidos

**Base.** Postgres 16 e Redis 7 **descartáveis** em Docker (o harness prova porta, `system_identifier` e nonce antes
de carregar qualquer coisa), com o seed de simulação (100 lojas, 1.000 pedidos, semente `sc-2026`) mais o seed de
volume do #138: **101.000 pedidos** antes de o k6 começar. API em `:3301` e site em `:3300`, só em `127.0.0.1`.

**Os 3 estágios** (`TABELA_DA_CARGA`, `tests/performance/k6/comum.js`), 8 minutos:

| estágio | duração | compradores virtuais |
|---|---|---|
| subida | 2 min | 0 → 20 |
| sustentação | 5 min | 20 |
| descida | 1 min | 20 → 0 |

**Os 3 cenários que rodam juntos** (`tests/performance/k6/carga.js`):

| cenário | o que faz | por que existe |
|---|---|---|
| `carga` (jornada mista) | vitrine → catálogo → produto → criar pedido → repetir a mesma chave (replay) → consultar o pedido, nos 3 estágios | é a carga do #131; os 2 primeiros minutos rodam sozinhos e servem de **janela de controle** |
| `conta` (trabalho fixo) | **5 requisições por segundo, constantes**, de `GET /v1/conta/pedidos`, do minuto 2 ao 7; 10 contas com 20 pedidos cada, em 2 lojas, criadas no `setup()` | o mesmo trabalho antes e depois: taxa de chegada fixa, e não "o que os VUs conseguirem" |
| `painel` | 2 donos (a maior e a menor loja) abrem a fila de pedidos a cada ~5 s, do minuto 2 ao 7, e tentam uma vez a fila da outra loja | mede a fila do painel e prova o isolamento entre lojas |

Cada resposta de `meus pedidos` precisa ser **exatamente** a lista da conta (20 pedidos, nenhum alheio); a fila de
outra loja precisa ser recusada. Uma execução só vale como medida se esses contadores ficarem em zero.

**Máquina:** notebook Apple M4, 10 CPUs, 16 GB, k6 v1.3.0, Node 24.18. Não é produção (ver a seção 7).

## 4. O gargalo: `app.meus_pedidos`

O #138 já tinha apontado, por EXPLAIN, que com 101 mil pedidos a única leitura lenta era a função
`app.meus_pedidos` (migração 0029), usada pela lista de pedidos da conta, pela exportação LGPD e pelas métricas da
conta. As duas execuções "antes" confirmaram sob carga: é a **única operação acima de 100 ms** e a única que
estourou uma meta.

| operação ("antes") | p50 | p95 | p99 | meta de p95 |
|---|---:|---:|---:|---:|
| meus pedidos, execução 1 | 335 ms | **588 ms** | 742 ms | < 500 ms — **estourou** |
| meus pedidos, execução 2 | 273 ms | 374 ms | 407 ms | < 500 ms |
| criação do pedido (pior das duas) | 28 ms | 73 ms | 110 ms | < 1.000 ms |
| catálogo (pior das duas) | 11 ms | 29 ms | 45 ms | < 500 ms |
| fila do painel (pior das duas) | 10 ms | 23 ms | 32 ms | < 500 ms |

**Por quê (EXPLAIN ANALYZE, BUFFERS).** Para uma conta com 167 pedidos em 5 lojas
([`carga-antes-1/explain/meus-pedidos-corpo-0029.txt`](desempenho/carga-antes-1/explain/meus-pedidos-corpo-0029.txt)):

```
Gather Merge  (actual time=40.096..2091.164 rows=167 loops=1)
  Buffers: shared hit=1292250 read=352153
  ->  Parallel Seq Scan on orders o          (actual rows=33667 loops=3)      ← lê os 101 mil pedidos
  SubPlan 1
    ->  Seq Scan on order_items i            (actual time=0.503..12.363 rows=2 loops=167)
          Filter: (order_id = o.id)
          Rows Removed by Filter: 167282                                      ← lê todos os itens, 167 vezes
Execution Time: 2091.993 ms
```

O corpo da 0029 junta `store_customers` e conta `order_items` **só pelo id**. Os índices que servem a essas leituras
começam por `store_id` (`orders_do_cliente_idx` e `order_items_do_pedido_idx`), então o planejador não consegue
usá-los: lê `orders` inteira e, para **cada** pedido devolvido, lê `order_items` inteira (12 ms × 167). O custo
cresce com o número de pedidos da conta **e** com o tamanho da base.

## 5. Antes × depois

**A otimização (uma só).** `packages/database/migrations/0074_meus_pedidos_por_loja.sql` substitui a função com o
mesmo corpo mais `c.store_id = o.store_id` na junção do cliente e `i.store_id = o.store_id` na contagem de itens.
Nenhum índice novo. Assinatura, colunas, `SECURITY DEFINER`, `search_path` e permissões são os mesmos (o teste
`packages/database/tests/meus-pedidos-por-loja.test.ts` confere no catálogo do Postgres e prova o isolamento entre
contas e entre lojas). O plano passa a usar os dois índices
([`carga-depois-1/explain/meus-pedidos-corpo-0074.txt`](desempenho/carga-depois-1/explain/meus-pedidos-corpo-0074.txt)):

```
->  Index Scan using orders_do_cliente_idx on orders o
      Index Cond: ((store_id = c.store_id) AND (store_customer_id = c.id))
->  Index Only Scan using order_items_do_pedido_idx on order_items i
      Index Cond: ((store_id = o.store_id) AND (order_id = o.id))
Buffers: shared hit=991            (antes: 1.644.403)
```

**Mesma carga dos dois lados.** O `comparar.ts` só monta a tabela se o harness (hash do conteúdo), o perfil, a
semente, a versão do k6, o volume e o trabalho fixo forem iguais, e se a única migração de diferença for a 0074.
Duas execuções de cada lado; a tabela mostra a mediana e **cada** execução
([`comparacao.md`](desempenho/comparacao.md)).

| operação | p95 antes (cada) | p95 depois (cada) | p99 antes | p99 depois | req/s antes | req/s depois | falhas HTTP |
|---|---:|---:|---:|---:|---:|---:|---:|
| **meus pedidos** | **481 ms** (588 / 374) | **9 ms** (9 / 9) | 575 ms | 11 ms | 3,06 | 3,07 | 0% / 0% |
| fila do painel | 18 ms (23 / 13) | 18 ms (17 / 19) | 24 ms | 20 ms | 0,24 | 0,25 | 0% / 0% |
| catálogo | 26 ms (29 / 23) | 26 ms (25 / 28) | 37 ms | 31 ms | 9,63 | 9,65 | 0% / 0% |
| criação do pedido | 57 ms (73 / 41) | 41 ms (39 / 43) | 88 ms | 48 ms | 1,20 | 1,21 | 0% / 0% |
| replay (mesma chave) | 32 ms (43 / 21) | 21 ms (20 / 22) | 47 ms | 26 ms | 1,20 | 1,21 | 0% / 0% |
| consulta do pedido | 13 ms (17 / 9) | 9 ms (9 / 9) | 22 ms | 11 ms | 1,20 | 1,21 | 0% / 0% |
| vitrine | 20 ms (22 / 18) | 20 ms (19 / 22) | 38 ms | 25 ms | 6,02 | 6,03 | 0% / 0% |
| produto | 28 ms (32 / 24) | 26 ms (24 / 27) | 45 ms | 31 ms | 3,09 | 3,09 | 0% / 0% |

| | antes (execução 1 / 2) | depois (execução 1 / 2) |
|---|---|---|
| EXPLAIN da chamada, conta de 167 pedidos | 2.040 ms / 1.916 ms | **0,7 ms / 0,7 ms** |
| vazão total | 46,78 / 46,53 req/s | 46,74 / 46,71 req/s |
| chamadas do cenário `conta` (trabalho fixo) | 1.501 / 1.501 | 1.501 / 1.500 |
| iterações descartadas do cenário `conta` | 0 / 0 | 0 / 0 |
| compras na jornada mista | 589 / 593 | 590 / 590 |
| controle: p95 do catálogo nos 2 min iniciais | 29 / 28 ms | 26 / 32 ms |
| controle: p95 da criação nos 2 min iniciais | 46 / 52 ms | 40 / 50 ms |
| metas de p95 | estourou `meus pedidos` / todas ok | todas ok / todas ok |

**Como ler.**
- **O ganho é de `meus pedidos`**: de centenas de ms para um dígito, nas duas execuções, com a mesma taxa de
  chegada (5 req/s) e o mesmo número de chamadas. A diferença entre os lados (≈ 50×) é muito maior que a
  diferença entre as duas execuções do "antes" (588 × 374 ms), que é o tamanho do ruído desta máquina.
- **A janela de controle não mudou** (catálogo 29/28 → 26/32 ms; criação 46/52 → 40/50 ms): o ambiente dos dois
  lados era equivalente antes de o trabalho fixo começar.
- **Criação e replay também ficaram um pouco mais rápidos** (p95 57 → 41 ms e 32 → 21 ms). É coerente com a
  função antiga disputando CPU e memória do Postgres com as demais consultas durante os 5 minutos do trabalho
  fixo, mas a diferença está dentro da variação entre as duas execuções do "antes" (73 × 41 ms): **não afirmamos
  esse ganho**.
- **Fila, catálogo, vitrine e produto** ficaram iguais, como esperado: a migração não toca nessas leituras.

## 6. Integridade: o número só vale se o pedido estiver certo

Cada execução é reconciliada com o banco depois do k6 (`reconciliacao.md` de cada pasta). Nas quatro:

| | antes 1 | antes 2 | depois 1 | depois 2 |
|---|---:|---:|---:|---:|
| pedidos na base antes do k6 | 101.000 | 101.000 | 101.000 | 101.000 |
| pedidos novos no banco | 789 | 793 | 790 | 790 |
| = compras do k6 + 200 do preparo das contas | 589 + 200 | 593 + 200 | 590 + 200 | 590 + 200 |
| replays corretos (200, mesmo pedido e total) | 589 | 593 | 590 | 590 |
| pedidos duplicados para a mesma chave | 0 | 0 | 0 | 0 |
| 500 na confirmação com pedido gravado (AC-516) | 0 | 0 | 0 | 0 |
| totais incorretos | 0 | 0 | 0 | 0 |
| respostas de `meus pedidos` com lista errada (`isolamento_violado`) | 0 | 0 | 0 | 0 |
| fila de outra loja entregue (`vazamento_painel`) | 0 | 0 | 0 | 0 |
| vínculos entre lojas na base (o que a trava da 0074 conta) | 0 | 0 | 0 | 0 |
| falhas inesperadas | 0% | 0% | 0% | 0% |

**A trava da migração.** A 0074 estreita o resultado: um pedido cujo cliente fosse de outra loja deixaria de
aparecer. Nada no banco impede esse vínculo (a FK é de uma coluna só), então a migração **conta** esses casos antes
de trocar a função e **recusa aplicar** se houver algum. A mesma consulta está em
[`docs/estruturacao/06-operacao.md`](estruturacao/06-operacao.md) (seção 4.1), para rodar antes do deploy. A volta
é uma migração nova com o corpo da 0029.

## 7. Limites desta medição (para ler os números com honestidade)

- **É um notebook, não produção.** Apple M4, 10 CPUs, 16 GB. O ruído aparece: os dois "antes" deram p95
  diferentes para a mesma operação (588 e 374 ms). Por isso há duas execuções de cada lado, a tabela mostra
  **cada uma** além da mediana, e a janela de controle (2 min iniciais, sem os cenários novos) mostra a deriva do
  ambiente.
- **O "antes" e o "depois" não rodaram na mesma hora.** O "antes" rodou em 20/11 (19:18 e 19:31), com o preview
  do sistema e outros processos no ar. A primeira tentativa do "depois" foi perdida (sessão interrompida e, em
  seguida, disco cheio); o "depois" válido rodou em 21/11 (01:26 e 01:39), depois de reiniciar o Docker e com o
  preview e as suítes dos outros trabalhos parados. Ou seja, o "depois" teve a máquina mais quieta. O que sustenta
  a comparação mesmo assim: a janela de controle ficou igual dos dois lados, as operações que a migração não toca
  (fila, catálogo, vitrine, produto) ficaram iguais, e o EXPLAIN — que não depende da carga — mostra a mesma
  queda (≈ 2,0 s → 0,7 ms).
- **API em `NODE_ENV=development`** (como no lançador do seed de simulação) e site em build de produção. Uma API
  de produção pode responder diferente.
- **Limitador do catálogo levantado** (60/min por IP → 1.000.000) para o k6, que sai de um endereço só, medir o
  catálogo e não o limitador. Em produção o limite continua valendo.
- **O trabalho fixo é pequeno de propósito:** 10 contas com 20 pedidos em 2 lojas. O custo do corpo antigo cresce
  com o número de pedidos **da conta** (um Seq Scan em `order_items` por pedido devolvido): o EXPLAIN da conta de
  167 pedidos mostra o caso grande (segundos), o k6 mostra o caso comum (centenas de ms). Os dois números não se
  comparam entre si; cada um se compara com o seu "depois".
- **O p99 da criação é indicativo.** São cerca de 600 criações por execução; a conformidade com o SLO (99% em 28
  dias) só se mede em produção, pelo histograma.
- **EXPLAIN na passada 2** (cache possivelmente quente) e medido com os textos versionados dos dois corpos, como
  `sc_migrator` (o dono da função `SECURITY DEFINER`); os números do #138 foram medidos como `sc_admin` e não são
  idênticos, mas são da mesma ordem.
- **Catálogo pequeno** (8 produtos por loja): o volume é de pedidos, não de produtos. O catálogo não foi
  estressado por tamanho.
- **Carga, não estresse.** O perfil é o de carga do #131 (1→20 VUs, 8 min). O estresse (20/40/60 VUs) com volume
  não foi rodado neste card.
- **Nada foi commitado nem rodado no GitHub Actions**: as execuções são locais, com alterações não commitadas. O
  `metadados.json` de cada execução traz o SHA curto da base e o hash do conteúdo do harness (`hashDoHarness`),
  que é o que identifica o código que rodou.

## 8. Propostas (não aplicadas: uma otimização só)

1. **`app.meus_itens_de_pedidos()` (migração 0059)** tem o mesmo padrão sem `store_id` nas junções e alimenta as
   métricas da conta. Mesma correção, a medir antes e depois.
2. **Fila do painel (P2 do #138):** índice parcial `(store_id, placed_at, number) WHERE status NOT IN
   ('COMPLETED','CANCELLED')`. Hoje a fila já responde em dezenas de ms com 2 mil pedidos por loja; o ganho
   seria de décimos de ms e só vale medir quando uma loja tiver dezenas de milhares.
3. **Impressão do corpo na idempotência do pedido** (422 quando a mesma chave chega com outro corpo) e **`jobId`
   determinístico no e-mail** (seção 2.2).
4. **Guarda estrutural** em `packages/database/guards/` que acuse pedido ligado a cliente de outra loja e item de
   outra loja (hoje só a trava da 0074 e a linha de base do ensaio contam isso), ou uma FK composta
   `(store_id, store_customer_id)`.
5. **Colocar `node --test tests/performance/ambiente/*.test.ts` no gate** (decisão de quem mantém o gate).

## 9. Como reproduzir e onde estão os artefatos

Precisa de Docker, do k6 (`K6_BIN`) e de nenhum `next dev` do site rodando (o build do ensaio usa a mesma `.next`).
Cada execução sobe e derruba o seu próprio Postgres e Redis; não toca na base de desenvolvimento.

```bash
# uma execução (≈ 4 min de preparo + 8 min de k6); ROTULO é a pasta da saída
VOLUME=sim PERFIL=completo ROTULO=carga-depois-1 bash tests/performance/ambiente/local.sh carga

# a tabela antes × depois (recusa se as execuções não forem comparáveis)
node tests/performance/ambiente/comparar.ts carga-antes-1 carga-antes-2 -- carga-depois-1 carga-depois-2

# a cópia saneada para docs/desempenho/<rótulo>/
node tests/performance/ambiente/artefatos.ts carga-antes-1 carga-antes-2 carga-depois-1 carga-depois-2
```

O "antes" foi medido antes de a migração 0074 existir na pasta de migrações; para refazê-lo hoje é preciso tirá-la
da pasta durante a execução. O harness está descrito em
[`docs/estruturacao/05-desempenho.md`](estruturacao/05-desempenho.md) (seção 10).

| pasta em `docs/desempenho/` | o que tem |
|---|---|
| `carga-antes-1/`, `carga-antes-2/` | função da 0029 vigente: `resumo.md/json` (k6), `relatorio.md`, `reconciliacao.md`, `k6.json`, `metadados.json`, `explain/` |
| `carga-depois-1/`, `carga-depois-2/` | o mesmo, com a 0074 vigente |
| `comparacao.md`, `comparacao.json` | a tabela da seção 5, como o `comparar.ts` gravou |

Identidade das quatro execuções: base `69cf0958ae92` com alterações não commitadas, harness `ec5f6b422c14`
(hash do conteúdo de `tests/performance/` e `packages/database/seed/`), semente `sc-2026`, referência
`2026-11-01T18:00:00-03:00`, k6 v1.3.0, perfil completo, 100.000 pedidos de volume.
