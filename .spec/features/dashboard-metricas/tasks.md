# Tasks: Painel e Métricas

> feature: dashboard-metricas

## T-800 — Consulta de métricas por período no fuso da loja [pendente]

- Refs: US-800, US-801, AC-800, AC-803, AC-804, AC-805
- Arquivos: apps/api/src/modules/metrics/periodo.ts, apps/api/src/modules/metrics/periodo.test.ts, apps/api/src/modules/metrics/metricas.usecase.ts, apps/api/src/modules/metrics/metricas.usecase.test.ts, apps/api/src/modules/metrics/metrics.schema.ts, packages/contracts/src/metrics.ts
- Notas: o corte de hoje e de qualquer intervalo usa o fuso da loja. Intervalo escolhido cobre os dois dias das pontas por completo. Data final anterior à inicial, ou intervalo acima do limite, é recusado mantendo o período anterior.
- Esforço: alto

## T-801 — Três números: vendido, concluído e em andamento [pendente]

- Refs: US-800, US-803, AC-817, AC-812
- Arquivos: apps/api/src/modules/metrics/faturamento.ts, apps/api/src/modules/metrics/faturamento.test.ts, apps/web/src/features/dashboard/CartoesDeMetrica.tsx
- Notas: venda conta a partir de aceito pelo dono. Concluído somado ao em andamento corresponde ao vendido. Cancelado nunca conta e aparece à parte, com a regra visível na tela.
- Esforço: medio

## T-802 — Índices e desempenho das consultas de métrica [pendente]

- Refs: US-803, AC-813
- Arquivos: packages/database/migrations/0009_indices_metricas.sql, apps/api/tests/metricas-desempenho.test.ts, packages/database/guards/g5_indice_cobre_politica.sql
- Notas: o índice inclui também as colunas citadas pelas políticas de isolamento — sem isso não há leitura direta pelo índice, achado medido durante a modelagem. Enquanto carrega, a tela mostra carregamento em vez de número errado.
- Esforço: alto

## T-803 — Painel do dia com comparação e estado inicial útil [pendente]

- Refs: US-800, AC-801, AC-802
- Arquivos: apps/web/src/app/(painel)/painel/page.tsx, apps/web/src/features/dashboard/ComparativoPeriodo.tsx, apps/web/src/features/dashboard/PainelVazio.tsx
- Notas: dia sem venda orienta e oferece compartilhar o link da vitrine, em vez de mostrar zero seco. Variação frente ao período anterior equivalente indica direção e tamanho.
- Esforço: medio

## T-804 — Seletor de período com endereço compartilhável [pendente]

- Refs: US-801, AC-803, AC-806
- Arquivos: apps/web/src/app/(painel)/painel/metricas/page.tsx, apps/web/src/features/dashboard/SeletorDePeriodo.tsx, apps/web/src/features/dashboard/SeletorDePeriodo.test.ts
- Notas: o período em vigor fica no endereço da página, então sobrevive ao recarregar e pode ser aberto em outra aba.
- Esforço: medio

## T-805 — Produtos mais vendidos, evolução e distribuição por hora [pendente]

- Refs: US-802, AC-807, AC-808, AC-809, AC-810
- Arquivos: apps/api/src/modules/metrics/ranking.usecase.ts, apps/api/src/modules/metrics/ranking.usecase.test.ts, apps/api/src/modules/metrics/serie.usecase.ts, apps/api/src/modules/metrics/serie.usecase.test.ts, apps/web/src/features/dashboard/RankingProdutos.tsx, apps/web/src/features/dashboard/EvolucaoDiaria.tsx, apps/web/src/features/dashboard/DistribuicaoPorHora.tsx
- Notas: dia e hora sem venda aparecem como zero, não desaparecem do gráfico. Ordenação alternável entre quantidade e valor. Divisão entre pedido do site e manual, com o total somando os dois. Gráfico legível em tela pequena antes de bonito em tela grande.
- Esforço: alto

## T-806 — Métricas nunca cruzam loja [pendente]

- Refs: US-803, AC-811
- Arquivos: apps/api/tests/metricas-isolamento.test.ts
- Notas: inclui a tentativa de informar o identificador de outra loja na requisição. Vale também para qualquer visão agregada — visão de banco precisa executar com os direitos de quem consulta, senão mostra todas as lojas. Marcado com @principle:P-003.
- Esforço: medio

## T-807 — Cache das métricas com horário de referência [pendente]

- Refs: US-803, AC-814
- Arquivos: apps/api/src/modules/metrics/cache.ts, apps/api/src/modules/metrics/cache.test.ts, apps/web/src/features/dashboard/HorarioDeReferencia.tsx
- Notas: a tela informa a que momento os números se referem e oferece atualizar agora. Pedido novo aparece dentro do prazo definido.
- Esforço: medio

## T-808 — Exportação do período [pendente]

- Refs: US-804, AC-815, AC-816
- Arquivos: apps/api/src/modules/metrics/exportar.usecase.ts, apps/api/src/modules/metrics/exportar.usecase.test.ts, apps/web/src/features/dashboard/BotaoExportar.tsx
- Notas: um pedido por linha, respeitando o período escolhido, sem dado que o dono não veria na tela e sem pedido de outra loja. A exportação é registrada na auditoria.
- Esforço: medio

## T-809 — Teste de ponta a ponta do painel [pendente]

- Refs: US-800, US-801, US-802, AC-800, AC-803, AC-807
- Arquivos: e2e/specs/dashboard.spec.ts
- Notas: cobre abrir o painel do dia, alternar entre hoje, três e sete dias, escolher intervalo e conferir que o endereço preserva o período.
- Esforço: medio
