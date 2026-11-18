# Tasks: Programa de fidelidade do cliente (A decidir)

> feature: decidir-fidelidade

<!--
  Card #125, bloco de códigos 12501 a 12599.
  TODAS as tarefas estão bloqueadas pela decisão do usuário (P-107): nenhuma
  começa antes de Q-12501 (fazer ou não) e Q-12502 (modelo) ficarem
  respondidas, e cada tarefa cita as outras perguntas de que depende.
  "Arquivos" lista só arquivos que já existem (o motor acusa arquivo
  inexistente). Os arquivos a criar ficam na linha "Novos (a criar)".
  Ordem obrigatória, uma após a outra, na pasta principal e sem worktree:
  T-12501, T-12502, T-12503, T-12504, T-12505, T-12506, T-12507, T-12508,
  T-12509, T-12510.
-->

## T-12501 — Regras puras do programa no core [pendente]

- Refs: US-12502, US-12503, US-12508, AC-12502, AC-12503, AC-12505, AC-12506, AC-12507, AC-12510, AC-12515, AC-12522
- Arquivos: packages/core/src/index.ts, packages/core/src/funcionalidades.ts
- Novos (a criar): packages/core/src/fidelidade.ts, packages/core/src/fidelidade.onp.test.ts
- Notas: funções sem banco para o crédito de um pedido (com a cópia da
  regra), a elegibilidade (programa ligado nas duas camadas, pedido manual,
  autocrédito), o limite do resgate, o saldo depois de cada lançamento e o
  cálculo do vencido. Chave nova de teto no catálogo de funcionalidades.
  Depende de Q-12502, Q-12505, Q-12506, Q-12508 e Q-12513.

## T-12502 — Contratos de entrada e saída [pendente]

- Refs: US-12501, US-12505, AC-12501, AC-12513, AC-12514
- Arquivos: packages/contracts/src/index.ts, packages/contracts/src/rotas.ts, packages/contracts/src/permissoes.ts
- Novos (a criar): packages/contracts/src/fidelidade.ts
- Notas: esquemas de configuração (inteiros com limites), ajuste (motivo e
  teto), extrato e resgate no fechamento. Permissão de configurar e ajustar
  só para o dono.

## T-12503 — Migração: tabelas, RLS e livro só de acréscimo [pendente]

- Refs: US-12504, US-12506, AC-12512, AC-12516
- Arquivos: packages/database/prisma/schema.prisma, apps/api/tests/isolamento-varredura.test.ts
- Novos (a criar): migração com o próximo número livre (hoje depois de 0073), teste de integração do livro em apps/api/tests
- Notas: as quatro exigências:
  - RLS por `app.current_store_id()` e, para o cliente, por conta;
  - REVOKE de UPDATE e DELETE no livro;
  - construtor em `CONSTRUTORES`;
  - chaves únicas começando por `store_id`, com chave própria para os
    lançamentos sem pedido.
    Coluna do desconto conforme Q-12515. O CHECK do saldo depende de Q-12507.

## T-12504 — Crédito ao concluir e devolução ao cancelar [pendente]

- Refs: US-12502, US-12504, AC-12503, AC-12504, AC-12505, AC-12506, AC-12511
- Arquivos: apps/api/src/modules/orders/mudar-status.usecase.ts, apps/api/src/modules/orders/devolver-estoque.ts
- Novos (a criar): módulo de fidelidade em apps/api/src/modules (uso de caso de crédito e devolução), teste de integração em apps/api/tests
- Notas: mesma transação da mudança de status; crédito que não duplica e
  nunca lança erro por configuração; devolução no bloco do cancelamento, uma
  vez por pedido.

## T-12505 — Resgate no fechamento e total do pedido [pendente]

- Refs: US-12503, AC-12507, AC-12508, AC-12509, AC-12510
- Arquivos: packages/core/src/taxa-entrega.ts, apps/api/src/modules/orders/criar-pedido.usecase.ts, apps/api/src/modules/orders/pedidos.routes.ts, apps/api/src/modules/orders/pedido-manual.routes.ts, apps/api/src/modules/orders/repetir-pedido.usecase.ts, apps/api/src/modules/printing/pedido-para-cupom.ts, apps/api/src/modules/orders/pedido-fechado.usecase.ts
- Novos (a criar): teste de integração de concorrência e repetição em apps/api/tests
- Notas: débito condicional na mesma transação em que o pedido nasce;
  repetição com a mesma chave não debita de novo. Parcela nova no resumo de
  valores. Depende de Q-12510 e Q-12511 e do contrato de descontos combinado
  com o #119 (ver design.md, seção 5).

## T-12506 — Configuração e ajuste pelo dono [pendente]

- Refs: US-12505, AC-12513, AC-12514, AC-12515
- Arquivos: apps/api/src/modules/customers/clientes.routes.ts, apps/api/src/app.ts, apps/api/src/core/funcionalidades.ts
- Novos (a criar): rotas de fidelidade do painel, teste de integração de autorização em apps/api/tests
- Notas: só o dono; funcionário e cliente recebem 403. Toda mudança e todo
  ajuste vão para a auditoria da loja na mesma transação.

## T-12507 — Extrato do cliente e privacidade [pendente]

- Refs: US-12501, US-12506, US-12507, AC-12501, AC-12516, AC-12517, AC-12519, AC-12520, AC-12521
- Arquivos: apps/api/src/modules/conta/conta.routes.ts, apps/api/src/modules/conta/privacidade.ts, apps/api/src/modules/orders/meus-pedidos.usecase.ts
- Novos (a criar): migração com a função de extrato e a nova versão da anonimização, teste de integração em apps/api/tests
- Notas: função de extrato no padrão de `app.meus_pedidos()`, sem receber
  loja nem ficha do cliente. A página pública do pedido não mostra saldo. A
  exportação inclui o extrato e a anonimização encerra o saldo com
  lançamento. Depende de Q-12509 e Q-12512.

## T-12508 — Importação e fichas sem conta [pendente]

- Refs: US-12506, AC-12518, AC-12519
- Arquivos: apps/api/src/modules/customers/importacao/importacao.usecase.ts, apps/api/src/modules/customers/remover.usecase.ts
- Novos (a criar): teste de integração em apps/api/tests
- Notas: a importação nunca cria lançamento; a ficha removida segue Q-12512;
  o saldo de uma ficha sem conta só muda de dono como Q-12509 decidir.

## T-12509 — Rotina de expiração [pendente]

- Refs: US-12508, AC-12522
- Arquivos: apps/api/src/jobs/index.ts, apps/api/src/core/db.ts
- Novos (a criar): job de expiração em apps/api/src/jobs, teste de integração
- Notas: só se Q-12506 aprovar validade. Roda loja por loja com contexto de
  loja, nunca pulando a RLS; não expira duas vezes.

## T-12510 — Telas do cliente e do dono [pendente]

- Refs: US-12501, US-12503, US-12505, AC-12501, AC-12502, AC-12510, AC-12513, AC-12514
- Arquivos: apps/web/src/app/(conta)/conta/layout.tsx, apps/web/src/features/usuario, apps/web/src/features/checkout, apps/web/src/app/(painel)/painel/config, apps/web/src/features/painel-clientes, apps/web/src/features/painel/secoes-do-painel.ts
- Novos (a criar): página de fidelidade em /conta e testes de tela `*.onp.test.tsx` em apps/web/tests
- Notas: proposta visual própria com a base do #104 (sem mockup no Stitch).
  Nada aparece com o programa desligado. Textos com o nome escolhido em
  Q-12502, sem dados do Stitch (P-105).
