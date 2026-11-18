# Tasks: Cupons promocionais e carteira de cupons (A decidir)

> feature: decidir-cupons

<!--
  Card #119, bloco de códigos 11901 a 11999.
  TODAS as tarefas estão bloqueadas pela decisão do usuário (P-107): nenhuma
  começa antes de Q-11901 (fazer ou não) ficar respondida, e cada tarefa cita
  as outras perguntas de que depende. Nenhuma tarefa do redesign
  (#104 a #114) depende destas.
  "Arquivos" lista só arquivos que já existem (o motor acusa arquivo
  inexistente); os arquivos a criar ficam na linha "A criar".
  Ordem obrigatória, uma após a outra, na pasta principal, sem worktree e
  sem o executor paralelo do motor: T-11901 a T-11910.
  As tarefas ficam [pendente] de propósito: o motor só aceita [concluida]
  com prova PASS (ASM-11910).
-->

## T-11901 — Regras puras do desconto no core [pendente]

- Refs: US-11901, AC-11901, AC-11904
- Arquivos: packages/core/src/taxa-entrega.ts, packages/core/src/index.ts
- A criar: packages/core/src/cupom-promocional.ts, packages/core/src/cupom-promocional.onp.test.ts
- Notas: função pura do desconto (valor ou percentual com arredondamento
  para baixo, limite ao subtotal, nunca sobre a taxa) e parcela no
  `calcularValores`/`ResumoDeValores`. Primeiro card aprovado entre #119 e
  #125 é o dono do contrato; o outro só acrescenta parcela. Bloqueada por
  Q-11901, Q-11903, Q-11904 e Q-11907.

## T-11902 — Contratos do cupom e do pedido [pendente]

- Refs: US-11901, US-11902, AC-11902, AC-11903, AC-11906
- Arquivos: packages/contracts/src/carrinho.ts, packages/contracts/src/index.ts, packages/contracts/src/rotas.ts
- A criar: packages/contracts/src/cupons-promocionais.ts
- Notas: `codigoDoCupom` e `descontoVistoCentavos` no pedido, motivos
  `cupom_invalido`, `desconto_divergente` e `cupom_ocupado`, regex do código
  e validações de regra do cupom. Depende de T-11901 e Q-11914.

## T-11903 — Tabelas, migration, Prisma e varredura de isolamento [pendente]

- Refs: US-11902, US-11903, US-11905, AC-11908, AC-11909, AC-11912, AC-11918, AC-11920
- Arquivos: packages/database/prisma/schema.prisma, packages/database/tests/esquema-cobre-o-banco.test.ts, apps/api/tests/isolamento-varredura.test.ts
- A criar: migration nova em packages/database/migrations com `coupons`, `coupon_redemptions` e `coupon_grants`
- Notas: RLS, CHECK `coupon_discount_cents <= subtotal_cents`, índice único
  `(store_id, order_id)`, exclusão lógica. Migration, model Prisma e
  `CONSTRUTORES`/`CAMADAS` entram juntos para a CI não ficar vermelha;
  a carteira ganha teste próprio entre identidades. Depende de T-11902,
  Q-11908, Q-11913 e do retorno descrito no design.

## T-11904 — Função de consumo atômico [pendente]

- Refs: US-11903, AC-11911, AC-11912, AC-11913
- Arquivos: apps/api/src/modules/orders/pedido-fechado.usecase.ts
- A criar: migration nova com `app.consumir_cupom` em packages/database/migrations
- Notas: SECURITY DEFINER com as defesas do 0027, `FOR UPDATE`,
  `lock_timeout` e 409 `cupom_ocupado`. Prova exige PostgreSQL (Q-11912).
  Depende de T-11903 e Q-11906.

## T-11905 — Rotas do painel e permissão [pendente]

- Refs: US-11902, AC-11906, AC-11907, AC-11908, AC-11909, AC-11910
- Arquivos: apps/api/src/app.ts, apps/api/src/core/equipe-da-loja.ts, packages/contracts/src/permissoes.ts
- A criar: módulo cupons-promocionais em apps/api/src/modules
- Notas: CRUD só do dono (ou permissão própria, Q-11911), desativação
  lógica e registro em `app.audit_log`. Depende de T-11903.

## T-11906 — Validação na vitrine e aplicação no pedido [pendente]

- Refs: US-11901, AC-11901, AC-11902, AC-11903, AC-11905, AC-11913
- Arquivos: apps/api/src/modules/orders/pedidos.routes.ts, apps/api/src/modules/orders/criar-pedido.usecase.ts, apps/api/src/modules/cart/carrinho.routes.ts, apps/api/src/core/limite.ts
- Notas: validação só autenticada com `limitarTentativas`, resposta
  uniforme, desconto recalculado no servidor, 409 quando diverge, consumo
  depois de `criarPedido` e antes de `reservarEstoque`, conferência anônima
  ignorando o cupom, pedido manual rejeitando o campo (Q-11910). Depende de
  T-11901, T-11902 e T-11904.

## T-11907 — Exibição do desconto: resposta, WhatsApp e impresso [pendente]

- Refs: US-11904, AC-11915, AC-11916, AC-11917
- Arquivos: apps/api/src/modules/printing/pedido-para-cupom.ts, packages/core/src/cupom-contrato.ts, apps/api/src/modules/orders/conta.routes.ts
- A criar: migration nova que recria `app.cupom_do_trabalho` com o desconto
- Notas: os dois caminhos do impresso (Prisma e função SQL com o agente em
  apps/agente-impressao) e os dois caminhos do WhatsApp (resposta normal e
  reenvio). Depende de T-11906.

## T-11908 — Painel do dono: cupons e pedido [pendente]

- Refs: US-11902, US-11904, AC-11906, AC-11907, AC-11914
- Arquivos: apps/web/src/features/painel/secoes-do-painel.ts, apps/web/src/lib/routes.ts
- A criar: página /painel/cupons em apps/web/src/app/(painel)/painel e feature de cupons em apps/web/src/features
- Notas: lista, criação, edição e desativação; linha do cupom no pedido do
  painel. Fila de arquivos do #112. Depende de T-11905 e T-11907.

## T-11909 — Campo de cupom no fechamento [pendente]

- Refs: US-11901, AC-11901, AC-11902, AC-11903, AC-11904
- Arquivos: apps/web/src/features/checkout/FechamentoDaCompra.tsx, apps/web/src/features/checkout/ResumoDoPedido.tsx, apps/web/src/lib/carrinho-do-navegador.ts
- Notas: campo e botão "Aplicar", linha de desconto, total, troco e PIX
  com desconto, tratamento dos 409 novos. Fila de arquivos do #110.
  Depende de T-11906 e Q-11914.

## T-11910 — Carteira de cupons na conta do cliente [pendente]

- Refs: US-11905, AC-11918, AC-11919, AC-11920
- Arquivos: apps/web/src/lib/quem-esta-logado.ts, apps/web/src/lib/routes.ts, apps/web/src/features/conta/VisaoGeralDaConta.tsx
- A criar: página /conta/cupons em apps/web/src/app/(conta)/conta e rota da carteira em apps/api/src/modules/orders
- Notas: lista sem saldo, vencido marcado, 404 para a carteira alheia.
  Fila de arquivos do #111. Depende de T-11903 e Q-11908.
