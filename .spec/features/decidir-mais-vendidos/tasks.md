# Tasks: Mais vendidos, em alta e recomendações públicas

> feature: decidir-mais-vendidos

<!--
  Card #124 — bloco de códigos 12401 a 12499.
  Todas as tarefas ficam [pendente] e BLOQUEADAS até o usuário responder "fazer"
  na Q-12401 (P-107). Nada aqui autoriza implementação.
  Em "Arquivos" só entram caminhos que já existem (pasta-mãe quando o arquivo é
  novo); os arquivos novos vão em "A criar", linha que o motor ignora.
-->

## T-12401 — Migração: função do ranking e opção da loja [pendente]

- Refs: US-12403, US-12404, US-12405, AC-12403, AC-12405, AC-12406, AC-12407, AC-12408, AC-12411, AC-12412, AC-12415, AC-12418
- Arquivos: packages/database/migrations/, packages/database/prisma/schema.prisma
- A criar: nova migração em packages/database/migrations/ com a função de ranking por loja e a coluna da opção
- Notas: bloqueada até a Q-12401 ser respondida "fazer". Segue o padrão de
  `0067_atacado_publico_do_feed.sql` e a guarda G10; valor inicial da coluna
  conforme a Q-12407; sem view materializada (G6).

## T-12402 — Contrato público do ranking [pendente]

- Refs: US-12404, AC-12409, AC-12410
- Arquivos: packages/contracts/src/vitrine.ts, packages/contracts/src/index.ts, packages/contracts/src/rotas.ts
- A criar: esquema estrito `{ produtoId, posicao }` e a entrada sem parâmetros de consulta
- Notas: bloqueada até a Q-12401. Depende de T-12401 só para os nomes.

## T-12403 — Caso de uso do ranking por loja [pendente]

- Refs: US-12402, US-12403, AC-12401, AC-12402, AC-12404, AC-12408, AC-12419
- Arquivos: apps/api/src/modules/storefront/
- A criar: caso de uso que chama a função de banco e devolve o mesmo corpo vazio nos três estados
- Notas: bloqueada até a Q-12401. Depende de T-12401 e T-12402. Inclui o teste
  de paridade com `situacaoNaVenda` (packages/core/src/situacao-na-venda.ts).

## T-12404 — Rota pública e cache [pendente]

- Refs: US-12402, US-12404, AC-12410, AC-12414, AC-12416
- Arquivos: apps/api/src/modules/storefront/vitrine.routes.ts, apps/api/src/core/cache.ts, apps/api/src/contracts/gerar.test.ts
- A criar: rota `GET /v1/vitrine/:apelido/mais-vendidos` sem parâmetros e o cache por loja
- Notas: bloqueada até a Q-12401. Depende de T-12402 e T-12403. Rate limit só
  após a Q-12411; não usar `limitarTentativas`.

## T-12405 — Opção do dono no painel [pendente]

- Refs: US-12405, AC-12413, AC-12414, AC-12415
- Arquivos: apps/api/src/modules/stores/, apps/web/src/features/config/, packages/contracts/src/permissoes.ts
- A criar: campo para ligar e desligar o ranking, só para o dono, com invalidação do cache
- Notas: bloqueada até a Q-12401. Depende de T-12401.

## T-12406 — Selo, legenda e aba na vitrine [pendente]

- Refs: US-12401, US-12403, AC-12401, AC-12402, AC-12407
- Arquivos: apps/web/src/features/vitrine/
- A criar: selo "Mais vendido", legenda do período e aba, ocultos quando a lista vem vazia
- Notas: bloqueada até a Q-12401. Depende de T-12404 e do card #107 (nunca o
  contrário, P-107).

## T-12407 — "Em alta" no feed da plataforma [pendente]

- Refs: US-12406, AC-12417, AC-12418
- Arquivos: apps/api/src/modules/feed/, packages/contracts/src/feed.ts, apps/web/src/features/feed/
- A criar: função entre lojas de saída mínima, nova ordem do feed e o filtro
- Notas: condicional. Só vale se a Q-12402 for respondida "plataforma". Depende
  de T-12401 e do card #106. Anúncios pagos não alteram a ordem.
