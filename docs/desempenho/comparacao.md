# Antes × depois — app.meus_pedidos (0029 → 0074)

Antes: carga-antes-1, carga-antes-2 · Depois: carga-depois-1, carga-depois-2

| operação | p95 antes (mediana; cada) | p95 depois (mediana; cada) | p99 antes | p99 depois | req/s antes | req/s depois | falhas HTTP antes | depois |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| meus_pedidos | 481 ms (588 / 374) | 9 ms (9 / 9) | 575 ms | 11 ms | 3.06 | 3.07 | 0.00% | 0.00% |
| fila | 18 ms (23 / 13) | 18 ms (17 / 19) | 24 ms | 20 ms | 0.24 | 0.25 | 0.00% | 0.00% |
| catalogo | 26 ms (29 / 23) | 26 ms (25 / 28) | 37 ms | 31 ms | 9.63 | 9.65 | 0.00% | 0.00% |
| criar | 57 ms (73 / 41) | 41 ms (39 / 43) | 88 ms | 48 ms | 1.20 | 1.21 | 0.00% | 0.00% |
| replay | 32 ms (43 / 21) | 21 ms (20 / 22) | 47 ms | 26 ms | 1.20 | 1.21 | 0.00% | 0.00% |
| consulta | 13 ms (17 / 9) | 9 ms (9 / 9) | 22 ms | 11 ms | 1.20 | 1.21 | 0.00% | 0.00% |
| vitrine | 20 ms (22 / 18) | 20 ms (19 / 22) | 38 ms | 25 ms | 6.02 | 6.03 | 0.00% | 0.00% |
| produto | 28 ms (32 / 24) | 26 ms (24 / 27) | 45 ms | 31 ms | 3.09 | 3.09 | 0.00% | 0.00% |

| | antes | depois |
|---|---|---|
| vazão total (req/s) | 46.78 / 46.53 | 46.74 / 46.71 |
| compras na jornada mista | 589 / 593 | 590 / 590 |
| chamadas do cenário conta | 1501 / 1501 | 1501 / 1500 |
| falhas inesperadas | 0.00% / 0.00% | 0.00% / 0.00% |
| controle: p95 catálogo nos 2 min iniciais | 29 / 28 ms | 26 / 32 ms |
| controle: p95 criação nos 2 min iniciais | 46 / 52 ms | 40 / 50 ms |
| EXPLAIN da chamada (ms) | 2040.4 / 1915.6 | 0.7 / 0.7 |
| integridade: reconciliação | aprovada / aprovada | aprovada / aprovada |
| pedidos novos no banco | 789 / 793 | 790 / 790 |
