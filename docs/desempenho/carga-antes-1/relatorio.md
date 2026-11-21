# Desempenho — carga: REPROVADA

## Identificação

| | |
|---|---|
| SHA | `69cf0958ae92` (+ alterações locais não commitadas) |
| ref / evento | main / local |
| versão do k6 | k6 v1.3.0 (commit/5870e99ae8, go1.25.1, darwin/arm64) |
| semente do seed | `sc-2026` |
| data de referência | `2026-11-01T18:00:00-03:00` |
| intervalo medido | 2026-11-20T22:18:57Z → 2026-11-20T22:27:06Z (perfil completo) |
| runner | local · darwin/arm64 · 10 CPUs (Apple M4) · 16 GB · Node v24.18.0 |
| configuração do ensaio | site: build de produção (standalone) · api: node apps/api/src/main.ts com NODE_ENV=development, como no lançador do seed · limiteDoCatalogoPorMinuto: 1000000 · limitePadraoDoCatalogoPorMinuto: 60 · indiceDoRedis: 6 · segundoPlano: desligado |
| validação do seed | **Resultado: APROVADO** — 17 de 17 verificações. |

## Resultado por camada

- execução válida como medida (preparo, reconciliação, integridade, isolamento e trabalho fixo): **sim**
- metas de p95/p99: **NÃO atingidas**
- k6 (thresholds): **reprovado (código 99)**
- reconciliação com o banco: **aprovada**
- pedidos iniciais + novas compras confirmadas: 101000 + 789; o replay soma zero
- lojas com tráfego: 100 de 100

## Classificação das ocorrências

Cada ocorrência cai em uma classe só. Lentidão não é falha; recusa prevista não é erro; o defeito conhecido não é infraestrutura.

| classe | quantidade | o que é |
|---|---:|---|
| Lentidão | 0 | meta de p95 ultrapassada (catálogo < 500 ms, criação < 1.000 ms) |
| Recusa de negócio prevista | 0 | loja fechada ou subtotal abaixo do mínimo, observados na própria iteração |
| Falha de infraestrutura | 0 | tempo esgotado, 429, 5xx, ou 500 sem pedido gravado |
| Pedido duplicado | 0 | mais de um pedido para a mesma chave de compra, no banco |
| Defeito conhecido AC-516 | 0 | 500 na confirmação com o pedido gravado (duas confirmações simultâneas com a mesma chave). Corrigido no #134 (savepoint); a classe fica para pegar regressão. NÃO é infraestrutura |
| Total incorreto | 0 | total ≠ subtotal + taxa, ou consulta ≠ criação |
| Rejeição inesperada | 0 | 4xx fora do previsto (403, 401, 404, 400, 409/422 sem explicação) |

## Arquivos desta etapa

`resumo.json` · `resumo.md` · `reconciliacao.json` · `reconciliacao.md` · `linha-de-base.json` · `metadados.json` · `k6.json` · `k6.log` · `chaves-incertas.json` · `validacao-do-seed/` · `api.log` · `site.log` · `build-site.log`

