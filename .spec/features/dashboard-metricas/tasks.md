# Tasks: Painel e Métricas

> feature: dashboard-metricas

## T-800 — Consulta de métricas por período no fuso da loja [concluida]

- Refs: US-800, US-801, AC-800, AC-803, AC-804, AC-805
- Arquivos: apps/api/src/modules/metrics/periodo.ts, apps/api/src/modules/metrics/periodo.test.ts, apps/api/src/modules/metrics/consultas.ts, apps/api/src/modules/metrics/metricas.usecase.ts, apps/api/src/modules/metrics/metrics.schema.ts, apps/api/src/modules/metrics/metricas.routes.ts, packages/contracts/src/metricas.ts, packages/contracts/src/index.ts, apps/api/src/app.ts, apps/api/tests/apoio-de-metricas.ts, apps/api/tests/metricas-periodo.test.ts
- Notas: o corte de hoje e de qualquer intervalo usa o fuso da loja. Intervalo escolhido cobre os dois dias das pontas por completo. Data final anterior à inicial, ou intervalo acima do limite, é recusado mantendo o período anterior. A rota é `GET /v1/lojas/:apelido/metricas` (`periodo`, `de`, `ate`, `atualizar`), montada em `app.ts`; o fuso vem de `storefront/fuso-da-loja.ts` pela composição, e o vínculo do dono com a loja é o de `core/db.ts` (404, dívida 92). O período em curso compara com o mesmo pedaço do anterior (decisão de 03/10/2026). A parte de tela do AC-803 e do AC-805 (período visível, recusa explicada mantendo o anterior) é da T-804.
- Esforço: alto

## T-801 — Três números: vendido, concluído e em andamento [concluida]

- Refs: US-800, US-803, AC-817, AC-812
- Arquivos: apps/api/src/modules/metrics/faturamento.ts, apps/api/src/modules/metrics/faturamento.test.ts, apps/api/tests/metricas-faturamento.test.ts, apps/web/src/features/dashboard/CartoesDeMetrica.tsx, apps/web/src/lib/metricas.ts, apps/web/tests/apoio-metricas.ts, apps/web/tests/cartoes-de-metrica.test.tsx
- Notas: venda conta a partir de aceito pelo dono. Concluído somado ao em andamento corresponde ao vendido. Cancelado nunca conta e aparece à parte, com a regra visível na tela. A regra escrita na tela é a `regraDeVenda` que a API devolve, e não um texto da tela; `apps/web/src/lib/metricas.ts` só escreve dinheiro, data e hora e confere a resposta pelo contrato. A divisão por canal (AC-810) aparece no cartão do vendido.
- Esforço: medio

## T-802 — Índices e desempenho das consultas de métrica [concluida]

- Refs: US-803, AC-813
- Arquivos: packages/database/migrations/0037_indices_metricas.sql, apps/api/tests/metricas-desempenho.test.ts
- Notas: o índice inclui também as colunas citadas pelas políticas de isolamento — sem isso não há leitura direta pelo índice, achado medido durante a modelagem; a guarda G5 (`packages/database/guards/g5_indice_cobre_politica.sql`, inalterada) cobra isso e passa sobre a 0037. O estado de carregamento da tela (enquanto carrega, carregamento em vez de número errado) é entregue com as telas da T-803 e da T-804.
- Esforço: alto

## T-803 — Painel do dia com comparação e estado inicial útil [concluida]

- Refs: US-800, AC-801, AC-802
- Arquivos: apps/web/src/app/(painel)/painel/page.tsx, apps/web/src/app/api/painel/metricas/route.ts, apps/web/src/server/encaminhar-ao-painel.ts, apps/web/src/features/dashboard/ComparativoPeriodo.tsx, apps/web/src/features/dashboard/PainelVazio.tsx, apps/web/src/features/dashboard/PainelDeMetricas.tsx, apps/web/src/features/dashboard/useMetricas.ts, apps/web/tests/painel-metricas.test.tsx, apps/web/tests/painel-metricas-encaminhamento.test.ts, apps/web/tests/painel-inicial.test.tsx
- Notas: dia sem venda orienta e oferece compartilhar o link da vitrine, em vez de mostrar zero seco. Variação frente ao período anterior equivalente indica direção e tamanho; no período em curso a API devolve até que instante o anterior foi contado (`comparacao.periodoAnterior.fim` e `parcial`), para a tela escrever "ontem até 14h32". O encaminhamento `/api/painel/metricas` segue o padrão de `server/encaminhar-ao-painel.ts` (`encaminharLeituraDaLoja`, que leva a consulta sem filtrar: quem recusa chave desconhecida é a API, AC-811). Os atalhos atuais do painel (configuração, categorias, produtos) continuam alcançáveis. Os quatro estados ficam em `CorpoDasMetricas`, o mesmo desenho do painel do dia e da página de períodos; enquanto carrega não há número na tela (o estado de carregamento do AC-813).
- Esforço: medio

## T-804 — Seletor de período com endereço compartilhável [concluida]

- Refs: US-801, AC-803, AC-806
- Arquivos: apps/web/src/app/(painel)/painel/metricas/page.tsx, apps/web/src/features/dashboard/SeletorDePeriodo.tsx, apps/web/src/features/dashboard/MetricasPorPeriodo.tsx, apps/web/src/features/dashboard/SeletorDePeriodo.test.tsx, apps/web/src/lib/routes.ts, apps/web/src/app/(painel)/painel/layout.tsx
- Notas: o período em vigor fica no endereço da página, então sobrevive ao recarregar e pode ser aberto em outra aba. O endereço usa os mesmos nomes da consulta da API (`periodo`, `de`, `ate`) e só muda depois que a API aceita o período, trocado no lugar (`replaceState`). Intervalo recusado (400 `periodo_invalido`) é explicado na tela e o período anterior continua valendo, com os números dele e o endereço dele (parte de tela do AC-805); o seletor não confere o intervalo, quem decide é a API.
- Esforço: medio

## T-805 — Produtos mais vendidos, evolução e distribuição por hora [concluida]

- Refs: US-802, AC-807, AC-808, AC-809, AC-810
- Arquivos: apps/api/src/modules/metrics/metricas.usecase.test.ts, apps/api/tests/metricas-ranking.test.ts, apps/web/src/features/dashboard/RankingProdutos.tsx, apps/web/src/features/dashboard/EvolucaoDiaria.tsx, apps/web/src/features/dashboard/DistribuicaoPorHora.tsx, apps/web/src/features/dashboard/GraficoDeBarras.tsx, apps/web/src/features/dashboard/AlternarMedida.tsx, apps/web/src/features/dashboard/PainelDeMetricas.tsx, apps/web/tests/graficos-de-metricas.test.tsx
- Notas: dia e hora sem venda aparecem como zero, não desaparecem do gráfico. Ordenação alternável entre quantidade e valor. Divisão entre pedido do site e manual, com o total somando os dois. Gráfico legível em tela pequena antes de bonito em tela grande, em SVG e CSS próprios, sem biblioteca (decisão de 03/10/2026). O cálculo do ranking e das séries mora em `apps/api/src/modules/metrics/consultas.ts` e `apps/api/src/modules/metrics/metricas.usecase.ts` (`unirRankings`, `completarDias`, `completarHoras`), entregues com a T-800. Na tela, cada ponto vira uma coluna de `GraficoDeBarras` (o zero como traço rente à base); o SVG tem texto alternativo com o resumo e a tabela inteira fica no "ver os números". As faixas de maior movimento são as até três horas com mais pedidos, destacadas em cor e escritas em texto. A evolução só aparece com mais de um dia no período; a divisão por canal do AC-810 está no cartão do vendido (T-801).
- Esforço: alto

## T-806 — Métricas nunca cruzam loja [concluida]

- Refs: US-803, AC-811
- Arquivos: apps/api/tests/metricas-isolamento.test.ts
- Notas: inclui a tentativa de informar o identificador de outra loja na requisição. Vale também para qualquer visão agregada — visão de banco precisa executar com os direitos de quem consulta, senão mostra todas as lojas. Marcado com @principle:P-003.
- Esforço: medio

## T-807 — Cache das métricas com horário de referência [concluida]

- Refs: US-803, AC-814
- Arquivos: apps/api/src/modules/metrics/cache.ts, apps/api/src/modules/metrics/cache.test.ts, apps/api/tests/metricas-cache.test.ts, apps/web/src/features/dashboard/HorarioDeReferencia.tsx, apps/web/src/features/dashboard/useMetricas.ts, apps/web/src/features/dashboard/PainelDeMetricas.tsx, apps/web/tests/horario-de-referencia.test.tsx
- Notas: a tela informa a que momento os números se referem e oferece atualizar agora. Pedido novo aparece dentro do prazo definido. O horário é o `calculadoEm` da API, escrito no fuso da loja; "atualizar agora" pede `atualizar=1` e mantém os números na tela até os novos chegarem. Com o painel aberto, o período em vigor é relido sozinho a cada minuto (ASM-802), sem pedir recálculo, porque a marca-d'água já invalida o guardado quando entra pedido.
- Esforço: medio

## T-808 — Exportação do período [concluida]

- Refs: US-804, AC-815, AC-816
- Arquivos: apps/api/src/modules/metrics/exportar.usecase.ts, apps/api/src/modules/metrics/exportar.usecase.test.ts, apps/api/tests/metricas-exportacao.test.ts, apps/web/src/app/api/painel/metricas/exportar/route.ts, apps/web/src/features/dashboard/BotaoExportar.tsx, apps/web/src/features/dashboard/MetricasPorPeriodo.tsx, apps/web/src/lib/metricas.ts, apps/web/tests/botao-exportar.test.tsx, apps/web/tests/painel-metricas-encaminhamento.test.ts
- Notas: um pedido por linha, respeitando o período escolhido, sem dado que o dono não veria na tela e sem pedido de outra loja. A exportação é registrada na auditoria. A rota é `GET /v1/lojas/:apelido/metricas/exportar`, em CSV genérico (decisão de 03/10/2026; Q-803 segue aberta). Na tela, o botão fica na página de períodos e pede a planilha do período EM VIGOR (o mesmo dos números, nunca o recusado); o arquivo é baixado pela tela, para sessão vencida ou recusa aparecerem como aviso em vez de um arquivo com erro dentro.
- Esforço: medio

## T-809 — Teste de ponta a ponta do painel [pendente]

- Refs: US-800, US-801, US-802, AC-800, AC-803, AC-807
- Arquivos: e2e/specs/dashboard.spec.ts
- Notas: cobre abrir o painel do dia, alternar entre hoje, três e sete dias, escolher intervalo e conferir que o endereço preserva o período.
- Esforço: medio
