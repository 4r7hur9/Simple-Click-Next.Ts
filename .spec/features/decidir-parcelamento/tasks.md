# Tasks: Parcelamento, boleto e novas condições de pagamento (A decidir)

> feature: decidir-parcelamento

<!--
  Card #126, bloco de códigos 12601 a 12699.
  TODAS as tarefas estão bloqueadas pela decisão do usuário (P-107): nenhuma
  começa antes de Q-10305 (pergunta-mãe), Q-12601 (fazer ou não) e Q-12602
  (offline ou online) ficarem respondidas. Elas valem para a alternativa A do
  design.md; se o usuário escolher a B, esta lista precisa de revisão.
  "Arquivos" lista só arquivos que já existem (o motor acusa arquivo
  inexistente). Os arquivos a criar ficam na linha "A criar".
  Ordem obrigatória, uma após a outra, na pasta principal e sem worktree:
  T-12601, T-12602, T-12603, T-12604, T-12605, T-12606, T-12607, T-12608.
  Nenhuma tarefa do redesign (#104–#114) depende destas, e estas só entram
  depois de #110 e #107 terminarem nos arquivos em comum.
-->

## T-12601 — Fonte única das formas e dos rótulos [pendente]

- Refs: US-12605, AC-12619, AC-12615
- Arquivos: packages/contracts/src/store-settings.ts, packages/contracts/src/index.ts, packages/core/src/pedido-descrito.ts, packages/core/src/cupom-blocos-partes.ts, packages/core/src/cupom-texto-blocos.ts, apps/api/src/modules/orders/pagamento.ts, apps/api/src/modules/orders/checkout.schema.ts, apps/api/src/modules/orders/pedido-fechado.usecase.ts, apps/api/src/modules/stores/configuracoes.usecase.ts, apps/api/src/modules/storefront/fechamento.usecase.ts, apps/api/src/modules/printing/pedido-para-cupom.ts, apps/web/src/features/checkout/FechamentoDaCompra.tsx, apps/web/src/features/config/FormularioPagamento.tsx, apps/web/src/features/pedido/AcompanhamentoDoPedido.tsx, apps/web/src/lib/quadro-de-pedidos.ts, apps/web/src/lib/metricas.ts, apps/web/src/features/loja/sobre/SecoesDoSobre.tsx, apps/web/src/features/feed-config/PreviaNoFeed.tsx, apps/web/src/features/painel-pedidos/MontarPedido.tsx, infra/tests/sem-cobranca.test.ts
- A criar: packages/contracts/src/formas-de-pagamento.ts
- Notas: uma lista de formas e rótulos usada por todos, sem a troca
  silenciosa por dinheiro (`?? "CASH"`, `as never`) em `pedidos.routes.ts` e
  `pedido-fechado.usecase.ts`. Forma sem rótulo falha em teste. Se
  `orders/pagamento.ts` for movido, ajustar `sem-cobranca.test.ts`. Atualizar
  também `contrato/openapi.json`. Depende de Q-10305, Q-12601 e Q-12602.

## T-12602 — Contrato das condições e cálculo das parcelas no core [pendente]

- Refs: US-12602, US-12603, AC-12604, AC-12605, AC-12608, AC-12609, AC-12610
- Arquivos: packages/contracts/src/store-settings.ts, packages/contracts/src/index.ts, packages/core/src/index.ts, packages/core/src/taxa-entrega.ts
- A criar: packages/core/src/parcelamento.ts, packages/core/src/parcelamento.onp.test.ts
- Notas: campo novo opcional em `esquemaDaConfiguracaoDePagamento` (JSON
  antigo `{formas, pix}` continua válido). Função pura de parcelas com as
  invariantes do design.md: soma igual ao total, centavos inteiros, nada
  negativo, resto na última parcela, rótulo "sem juros" calculado. Teste por
  propriedade. Depende de T-12601 e de Q-12603, Q-12604 e Q-12608.

## T-12603 — API: configuração das condições e saída pública [pendente]

- Refs: US-12601, US-12602, AC-12601, AC-12603, AC-12604, AC-12605, AC-12606, AC-12607
- Arquivos: apps/api/src/modules/stores/configuracoes.usecase.ts, apps/api/src/modules/stores/configuracoes.schema.ts, apps/api/src/modules/storefront/fechamento.usecase.ts, apps/api/tests/vitrine-sem-dado-sensivel.test.ts, packages/contracts/src/vitrine.ts
- A criar: apps/api/src/modules/stores/condicoes-de-pagamento.onp.test.ts
- Notas: condições em `ler`, `gravar` e `sensiveis` (trilha com antes e
  depois, ação sensível). Saída pública só com a lista fixa de campos. STAFF
  recebe 403. Nenhum segredo no JSON `payment`. O teste de dado sensível da
  vitrine é atualizado junto. Depende de T-12602.

## T-12604 — Pedido online e manual: validar, recalcular e gravar o retrato [pendente]

- Refs: US-12604, US-12605, AC-12612, AC-12613, AC-12614, AC-12615, AC-12616, AC-12617, AC-12618, AC-12620
- Arquivos: packages/contracts/src/carrinho.ts, packages/contracts/src/clientes.ts, apps/api/src/app.ts, apps/api/src/modules/orders/pedidos.routes.ts, apps/api/src/modules/orders/pedido-manual.routes.ts, apps/api/src/modules/orders/criar-pedido.usecase.ts, apps/api/src/modules/orders/pagamento.ts, packages/database/prisma/schema.prisma
- A criar: migração nova de colunas anuláveis em packages/database/migrations (número seguinte ao último existente), apps/api/src/modules/orders/condicao-do-pedido.onp.test.ts
- Notas: corpo estrito só com identificador da condição e parcelas; 422 para
  adulteração e para condição inexistente, desativada ou de outra loja; 409
  para condição alterada. O AC-504 legado não muda. Adaptador do JSON real
  para `montarPagamento`; `FechamentoParaFechar` e as duas montagens em
  `app.ts` passam a trazer a configuração. Colunas de acréscimo, desconto e
  retrato, com CHECK de valor não negativo, sem preencher pedidos antigos. O
  sistema nunca marca pago sozinho. Depende de T-12602, T-12603 e de Q-12610.

## T-12605 — Painel: tela de condições de pagamento [pendente]

- Refs: US-12602, AC-12604, AC-12605, AC-12607
- Arquivos: apps/web/src/features/config/FormularioPagamento.tsx, apps/web/src/lib/previa-da-mensagem.ts
- A criar: apps/web/src/features/config/FormularioDeCondicoes.tsx, apps/web/tests/condicoes-de-pagamento-painel.onp.test.tsx
- Notas: proposta visual própria, fora do ZIP do Stitch (ASM-12606), com a
  base do card #104. Formas atuais intactas. Depende de T-12602 e T-12603.

## T-12606 — Fechamento: escolher a condição e conferir os valores [pendente]

- Refs: US-12601, US-12603, AC-12601, AC-12602, AC-12608, AC-12609, AC-12610, AC-12611
- Arquivos: apps/web/src/features/checkout/SeletorDePagamento.tsx, apps/web/src/features/checkout/FechamentoDaCompra.tsx, apps/web/src/lib/carrinho-do-navegador.ts
- A criar: apps/web/tests/condicoes-no-fechamento.onp.test.tsx
- Notas: mostrar preço à vista, parcelas, valor, acréscimo e total a prazo
  antes de confirmar, com o texto "combinado com a loja". O corpo envia só
  identificador e parcelas. Só entra depois de #110 terminar nesses
  arquivos. Depende de T-12602, T-12603 e T-12604.

## T-12607 — Exibições, cupom do agente e métricas [pendente]

- Refs: US-12605, US-12606, AC-12619, AC-12620, AC-12621
- Arquivos: packages/contracts/src/acompanhamento.ts, apps/api/src/modules/orders/acompanhar.usecase.ts, apps/api/src/modules/orders/quadro.usecase.ts, apps/api/src/modules/orders/fila.routes.ts, apps/api/src/modules/metrics/consultas.ts, apps/web/src/features/pedido/AcompanhamentoDoPedido.tsx, apps/web/src/lib/quadro-de-pedidos.ts, apps/web/src/lib/metricas.ts, packages/core/src/cupom-blocos-partes.ts, packages/core/src/cupom-texto-blocos.ts, packages/database/migrations/0068_atacado_no_cupom.sql
- A criar: migração nova com `CREATE OR REPLACE` de `app.cupom_do_trabalho` em packages/database/migrations, apps/web/tests/condicao-nas-exibicoes.onp.test.tsx
- Notas: tudo lê o retrato gravado no pedido, nunca a configuração atual. O
  cupom pelo clique e o pelo agente mostram o mesmo texto (teste de
  paridade). Pedido antigo continua como estava. O acréscimo não entra no
  faturamento por forma (Q-12609). A migração antiga 0068 só é lida como
  referência, não editada. Depende de T-12604.

## T-12608 — Resumo das condições na vitrine e no produto [pendente]

- Refs: US-12601, AC-12602, AC-12603
- Arquivos: apps/web/src/app/(loja)/loja/[slug]/TelaDaLoja.tsx, apps/web/src/features/vitrine/GradeDeProdutos.tsx, apps/web/src/features/loja/sobre/SecoesDoSobre.tsx, apps/web/src/features/loja/SobreDaLoja.tsx
- A criar: apps/web/tests/resumo-de-condicoes.onp.test.tsx
- Notas: só se Q-12607 for respondida a favor. Usa um caminho público próprio,
  sem chave PIX. Só entra depois de #107 terminar nesses arquivos. Loja sem
  condições não mostra nada. Depende de T-12603.
