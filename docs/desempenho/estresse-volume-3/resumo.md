# Resumo do k6 — estresse (perfil completo, rodada c57df0e7)

**Thresholds do k6:** APROVADO · duração medida 722.5 s

## Por operação

| operação | requisições | req/s | p50 | p90 | p95 | p99 | máx | falhas HTTP |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| cadastro | 60 | 0.08 | 103 ms | 117 ms | 125 ms | 149 ms | 177 ms | 0.00% |
| vitrine | 8196 | 11.34 | 7 ms | 13 ms | 17 ms | 23 ms | 54 ms | 0.00% |
| pagina | 2019 | 2.79 | 12 ms | 24 ms | 31 ms | 46 ms | 76 ms | 0.00% |
| catalogo | 13114 | 18.15 | 8 ms | 15 ms | 19 ms | 29 ms | 72 ms | 0.00% |
| produto | 4244 | 5.87 | 10 ms | 17 ms | 22 ms | 31 ms | 61 ms | 0.00% |
| imagem | 19671 | 27.22 | 0 ms | 1 ms | 2 ms | 4 ms | 29 ms | 0.00% |
| fechamento | 1639 | 2.27 | 6 ms | 11 ms | 13 ms | 19 ms | 34 ms | 0.00% |
| carrinho | 1639 | 2.27 | 12 ms | 18 ms | 21 ms | 28 ms | 84 ms | 0.00% |
| conferencia | 1639 | 2.27 | 6 ms | 9 ms | 11 ms | 14 ms | 22 ms | 0.00% |
| criar | 1639 | 2.27 | 20 ms | 28 ms | 33 ms | 43 ms | 95 ms | 0.00% |
| replay | 1639 | 2.27 | 11 ms | 15 ms | 17 ms | 25 ms | 55 ms | 0.00% |
| consulta | 1639 | 2.27 | 5 ms | 6 ms | 7 ms | 10 ms | 21 ms | 0.00% |

## Classificação (o que o k6 viu)

| classe | quantidade | detalhe |
|---|---:|---|
| Lentidão | 0 | metas de p95 respeitadas |
| Recusa de negócio prevista | 0 | loja fechada 0, mínimo do pedido 0 |
| Falha de infraestrutura | 0 | tempo esgotado/sem resposta 0, 429 0, 5xx 0 |
| Rejeição inesperada (4xx fora do previsto) | 0 | 403, 401, 404, 400, 409/422 sem explicação |
| Total incorreto | 0 | total ≠ subtotal + taxa, ou consulta ≠ criação |
| Replay divergente (sinal) | 0 | replay ≠ 200 ou com outro pedido; o veredito de duplicidade é do banco |
| Falhas inesperadas (taxa) | 0.00% | critério dos thresholds de falha |

## Compras

- compras criadas (201): **1639**
- replays corretos (200, mesmo pedido e total): **1639**
- criações incertas (tempo esgotado ou 5xx): **0**; recuperadas pelo replay: 0
- 500 no replay: 0

## Patamares do estresse

| patamar | VUs | requisições | req/s | p95 catálogo | p95 criação | falhas | acima da meta? |
|---|---:|---:|---:|---:|---:|---:|---|
| rampa-20 | 20 | 1598 | 2.21 | 32 ms | 41 ms | 0.00% | não |
| p20 | 20 | 6273 | 8.68 | 29 ms | 42 ms | 0.00% | não |
| rampa-40 | 40 | 4662 | 6.45 | 19 ms | 33 ms | 0.00% | não |
| p40 | 40 | 12579 | 17.41 | 16 ms | 30 ms | 0.00% | não |
| rampa-60 | 60 | 7786 | 10.78 | 14 ms | 28 ms | 0.00% | não |
| p60 | 60 | 19009 | 26.31 | 12 ms | 26 ms | 0.00% | não |
| descida | 1 | 4915 | 6.80 | 18 ms | 35 ms | 0.00% | não |
| recuperacao | 1 | 316 | 0.44 | 33 ms | 55 ms | 0.00% | não |

**Nenhum patamar passou da meta. Maior carga verificada: 60 usuários virtuais (todos os patamares dentro da meta).**

**Recuperação na janela final:** metas recuperadas.

## Vazão, validade e metas

- vazão: **79.08 req/s** (57139 requisições), 11.34 iterações/s; compras 1639 + 0 do preparo
- execução válida (integridade, isolamento, trabalho fixo): **SIM**
- metas de p95/p99: **atingidas**

## Thresholds

| métrica | expressão | resultado |
|---|---|---|
| http_req_duration{op:criar,patamar:recuperacao} | p(95)<1000 | ok |
| totais_errados | count==0 | ok |
| http_req_duration{op:catalogo,patamar:recuperacao} | p(95)<500 | ok |
| falhas_inesperadas{patamar:recuperacao} | rate<0.01 | ok |
| replay_divergente | count==0 | ok |
