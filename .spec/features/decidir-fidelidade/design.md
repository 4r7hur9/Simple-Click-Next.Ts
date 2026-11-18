# Design: Programa de fidelidade do cliente (A decidir)

> feature: decidir-fidelidade

<!--
  Card #125. Tudo aqui é PROPOSTA para o usuário decidir (P-107); nada foi
  aprovado. Revisado de forma adversarial (arquitetura e segurança) antes de
  ser escrito; os achados estão incorporados nas seções abaixo.
-->

## 1. Estado atual (evidências do código)

Leitura feita em 05/11/2026 na raiz `/Users/stargrupo/Projetos/SC`.

### Fatos

| Tema                 | O que existe                                                                                                                                                                                  | Onde                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Fidelidade           | Nada. Nenhum código de pontos, carimbos, cashback ou recompensa. Só a linha da matriz do Stitch                                                                                               | `.spec/features/stitch-planejamento/design.md` (linhas 106 e 245)                                                                 |
| Etapas do pedido     | Pedido gerado, Confirmado, Em preparo, Retirada ou Saiu para entrega, Concluída; Cancelado fora do quadro                                                                                     | `packages/contracts/src/etapas-do-pedido.ts` (`ETAPAS_DO_PEDIDO`)                                                                 |
| Máquina de status    | Concluído (`COMPLETED`) é final: não volta nem é cancelado. Cancelar exige motivo                                                                                                             | `packages/core/src/maquina-status.ts` (`proximosStatus`, `decidirTransicao`)                                                      |
| Mudança de status    | Único lugar que grava Concluído. Update condicional ao status lido, devolução de estoque no cancelamento e histórico, tudo numa transação                                                     | `apps/api/src/modules/orders/mudar-status.usecase.ts` (`mudarStatusDoPedido`)                                                     |
| Quem muda status     | Dono e funcionário, pela rota de status do pedido; o cliente só lê                                                                                                                            | `apps/api/src/modules/orders/fila.routes.ts`                                                                                      |
| Devolução de estoque | Feita uma vez por pedido cancelado, mesma transação; é o modelo para devolver o resgate                                                                                                       | `apps/api/src/modules/orders/devolver-estoque.ts` (`devolverEstoqueDoPedido`)                                                     |
| Valores do pedido    | Centavos em BigInt. Parcelas de cupom, retirada e desconto genérico, todas com CHECK maior ou igual a zero, e total também                                                                    | `packages/database/prisma/schema.prisma` (`Order`), `packages/database/migrations/0008_pedidos.sql`                               |
| Cálculo do total     | `calcularValores` e `ResumoDeValores`; `pedido-total.ts` só confere o subtotal dos itens                                                                                                      | `packages/core/src/taxa-entrega.ts`, `packages/core/src/pedido-total.ts`                                                          |
| Desconto genérico    | `discountCents` recebe `descontoEmCentavos`, hoje sempre 0. Chave de repetição opcional (`idempotencyKey`)                                                                                    | `apps/api/src/modules/orders/criar-pedido.usecase.ts`                                                                             |
| Cupom impresso       | Lê o desconto do pedido para imprimir                                                                                                                                                         | `apps/api/src/modules/printing/pedido-para-cupom.ts`                                                                              |
| Cliente da loja      | `StoreCustomer` é uma ficha por loja, com conta opcional (`identityId`), telefone (`phoneKey`), `anonymizedAt`, `removedAt`. Os contadores `ordersCount` e `totalSpentCents` ninguém atualiza | `packages/database/prisma/schema.prisma` (`StoreCustomer`), `apps/api/src/modules/customers/listar.usecase.ts`                    |
| Pedido manual        | Aceita ficha sem conta ou nenhuma ficha                                                                                                                                                       | `apps/api/src/modules/orders/pedido-manual.usecase.ts`                                                                            |
| Checkout do site     | Exige conta logada                                                                                                                                                                            | `apps/api/src/modules/orders/comprador-da-conta.ts`                                                                               |
| Pedidos entre lojas  | O cliente lê os próprios pedidos de todas as lojas por uma função de banco com escopo de cliente                                                                                              | `apps/api/src/modules/orders/meus-pedidos.usecase.ts` (`app.meus_pedidos()`)                                                      |
| Privacidade          | Exportação de dados e anonimização da conta já existem                                                                                                                                        | `apps/api/src/modules/conta/privacidade.ts` (`juntarOsDados`), `packages/database/migrations/0073_aceites_legais.sql`             |
| Isolamento           | RLS por `app.current_store_id()`, contexto por transação; varredura exige construtor para toda tabela com `store_id`, mas só testa entre lojas                                                | `apps/api/src/core/db.ts` (`PARAMETROS_DE_CONTEXTO`), `apps/api/tests/isolamento-varredura.test.ts` (`CONSTRUTORES`)              |
| Liga e desliga       | O catálogo de funcionalidades nasce ligado e só a administração desliga: é teto da plataforma, não chave do dono                                                                              | `packages/core/src/funcionalidades.ts` (`funcionalidadeLigada`), `packages/database/migrations/0040_funcionalidades_por_loja.sql` |
| Limites por loja     | Recursos limitados e padrões da plataforma                                                                                                                                                    | `packages/contracts/src/limites.ts`, `apps/api/src/core/limites-da-loja.ts`                                                       |
| Auditoria            | `AuditLog` por loja, só de acréscimo                                                                                                                                                          | `packages/database/prisma/schema.prisma` (`AuditLog`)                                                                             |
| Rotinas              | Fila e jobs do servidor                                                                                                                                                                       | `apps/api/src/jobs/index.ts`                                                                                                      |
| Prova ONP            | O verify roda só os projetos `web` e `unit` do vitest; testes de banco (`api-int`) não são lidos                                                                                              | `onpspec.config.json` (`testCommand`), `vitest.config.ts`                                                                         |

### Inferências

- Creditar em Concluído dispensa reverter crédito por cancelamento, porque um
  pedido concluído não é cancelado. A reversão que importa hoje é devolver o
  benefício usado num pedido cancelado antes de concluir.
- O saldo combina com a ficha por loja (`StoreCustomer`). Um programa entre
  lojas seria um padrão novo.
- Total guardado em cache já envelheceu neste projeto (os contadores da
  ficha). O saldo precisa de um livro só de acréscimo que o comprove.

### Desconhecido

As regras comerciais: modelo, quem paga, validade, estorno, canais e
acúmulo com cupom. Estão nas perguntas Q-12501 a Q-12515 da spec.

## 2. Alternativas de modelo

| Alternativa               | Como funciona                                                        | A favor                                                    | Contra                                                                    |
| ------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| A. Pontos por valor gasto | Cada real do pedido concluído vira pontos; pontos viram desconto     | Serve a qualquer ramo; o cliente entende; fácil de limitar | Conta mais complexa (taxa, arredondamento, teto); vira passivo da loja    |
| B. Cartão de carimbos     | Cada pedido concluído vale um carimbo; N carimbos dão uma recompensa | Muito simples de explicar; bom para comida e serviços      | Pedido pequeno vale igual a pedido grande; precisa definir valor mínimo   |
| C. Cashback em dinheiro   | Parte do valor volta como saldo em reais                             | Atraente para o cliente                                    | Carteira monetária, risco fiscal e financeiro; fora do que está presumido |
| D. Não fazer              | Remover a menção do rodapé                                           | Custo zero                                                 | Perde um motivo de recompra                                               |

**Proposta (não decidida):** A ou B, escolhido pelo dono de cada loja dentro
do teto da plataforma, pago pela própria loja, com crédito em Concluído. O
modelo de dados abaixo serve aos dois (a unidade é um inteiro: pontos ou
carimbos).

## 3. Duas camadas de liga e desliga

1. **Teto da plataforma**: chave nova em `CATALOGO_DE_FUNCIONALIDADES`
   (`packages/core/src/funcionalidades.ts`). A administração usa para impedir o
   programa numa loja ou num plano (Q-12514).
2. **Configuração do dono**: tabela própria da loja, **desligada por padrão**,
   com o modelo, a taxa ou o número de carimbos, o mínimo do pedido, o teto de
   resgate, a validade e o crédito em pedido manual (padrão: não).

O crédito e o resgate checam as duas camadas no momento de agir, não só na
tela de configuração.

## 4. Modelo de dados proposto

Migração nova com o próximo número livre. Hoje a última é `0073_aceites_legais.sql`.

- **`loyalty_programs`** (`store_id` como chave): a configuração do dono.
  Valores inteiros com CHECK de faixa e nada de número com vírgula.
- **`loyalty_balances`** (`store_id`, `store_customer_id`): a linha de saldo,
  com CHECK de saldo maior ou igual a zero. O débito é condicional (atualiza
  só se o saldo cobre o valor) e roda na mesma transação que grava o livro e
  o pedido. Assim dois resgates paralelos não passam (AC-12508).
- **`loyalty_ledger`** (só de acréscimo):
  - `store_id`, `store_customer_id`, `order_id` (opcional), tipo (CREDITO,
    RESGATE, DEVOLUCAO, AJUSTE, EXPIRACAO, ENCERRAMENTO), quantidade com
    sinal, saldo depois, cópia da regra, canal do pedido, quem agiu e quando;
  - sem nome, telefone, e-mail nem texto livre com dado pessoal (AC-12521);
    o motivo do ajuste vai para a auditoria;
  - chave única `(store_id, order_id, tipo)` para lançamentos de pedido, e
    chave única parcial com chave própria para AJUSTE, EXPIRACAO e
    ENCERRAMENTO (o guard g3 exige que comece por `store_id`);
  - REVOKE de UPDATE e DELETE para o papel da aplicação, no mesmo padrão do
    histórico de status (AC-12512);
  - RLS por loja e, para o cliente, por `store_customers.identity_id =
app.current_user_id()`; nunca por identificador que venha do corpo ou da
    URL (AC-12516);
  - construtor novo em `CONSTRUTORES` da varredura de isolamento.
- **Conflito entre CHECK e estorno**: se Q-12507 aprovar um estorno depois
  de concluído e o cliente já tiver gastado, ou o saldo passa a aceitar
  negativo e bloqueia resgates, ou a devolução tira só o que houver e o resto
  fica registrado. Cada opção muda o CHECK. Fica para a decisão.

## 5. Onde o programa se encaixa

| Momento                    | Encaixe proposto                                                                                                                                                                                              | Arquivos existentes                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Crédito                    | Em `mudarStatusDoPedido`, ao ir para Concluído, na mesma transação. Insere sem lançar erro se já existir, e configuração ausente ou inválida não credita nem falha (AC-12504). Alternativa: outbox com rotina | `apps/api/src/modules/orders/mudar-status.usecase.ts`, `apps/api/src/jobs/index.ts`                           |
| Devolução no cancelamento  | No mesmo bloco de `devolverEstoqueDoPedido`, uma vez por pedido (AC-12511)                                                                                                                                    | `apps/api/src/modules/orders/mudar-status.usecase.ts`                                                         |
| Resgate                    | Função pura nova no core calcula o abatimento; o pedido grava o débito na mesma transação em que nasce, protegido pela chave de repetição (AC-12509)                                                          | `apps/api/src/modules/orders/criar-pedido.usecase.ts`, `apps/api/src/modules/orders/pedidos.routes.ts`        |
| Total                      | Parcela nova em `ResumoDeValores`. Ordem proposta: cupom, desconto de retirada, fidelidade. Limite: subtotal menos os outros descontos (AC-12510)                                                             | `packages/core/src/taxa-entrega.ts`                                                                           |
| Onde fica o desconto       | Coluna própria do pedido (proposta) ou o `discount_cents` que já existe (Q-12515). Nunca as colunas de cupom, que são do #119                                                                                 | `packages/database/prisma/schema.prisma`                                                                      |
| Impressão e tela do pedido | Mostrar a linha do desconto da fidelidade                                                                                                                                                                     | `apps/api/src/modules/printing/pedido-para-cupom.ts`, `apps/api/src/modules/orders/pedido-fechado.usecase.ts` |
| Extrato do cliente         | Função de banco `app.meu_extrato_de_fidelidade()`, no padrão de `app.meus_pedidos()`, sem receber loja nem ficha do cliente                                                                                   | `apps/api/src/modules/orders/meus-pedidos.usecase.ts`, `apps/api/src/modules/conta/conta.routes.ts`           |
| Configuração e ajuste      | Rotas só do dono, com validação, auditoria e teto do ajuste                                                                                                                                                   | `apps/api/src/modules/customers/clientes.routes.ts`, `packages/contracts/src/permissoes.ts`                   |
| Privacidade                | A exportação ganha o extrato; a anonimização encerra o saldo com lançamento (nova versão da função na migração)                                                                                               | `apps/api/src/modules/conta/privacidade.ts`, `packages/database/migrations/0073_aceites_legais.sql`           |
| Importação de clientes     | Não cria lançamento (AC-12518)                                                                                                                                                                                | `apps/api/src/modules/customers/importacao/importacao.usecase.ts`                                             |
| Expiração                  | Rotina loja por loja com contexto de loja, nunca pulando a RLS; lançamento EXPIRACAO com chave própria (AC-12522)                                                                                             | `apps/api/src/jobs/index.ts`, `apps/api/src/core/db.ts`                                                       |

### Contrato de descontos com o card #119

Combinado com o #119 por mensagem do board em 05/11/2026:

- a fidelidade não usa `coupon_discount_cents`, `coupon_id` nem
  `coupon_code_snapshot`;
- o primeiro card aprovado entre #119 e #125 vira dono do contrato de
  descontos (`calcularValores` e `ResumoDeValores`); o outro só acrescenta
  uma parcela;
- se a fidelidade vier primeiro, o contrato mínimo é: desconto da fidelidade
  no máximo igual ao subtotal menos os outros descontos, e total nunca
  negativo;
- o acúmulo com cupom e a ordem ficam em Q-12510.

## 6. Telas (sem mockup no Stitch)

Precisam de proposta visual própria com a base do #104:

- **Conta do cliente**: página nova de fidelidade com saldo por loja e
  extrato. Entra no menu da conta (`apps/web/src/app/(conta)/conta/layout.tsx`
  e `apps/web/src/features/usuario/`).
- **Fechamento do pedido**: bloco "usar meu benefício" com o saldo e o limite
  (`apps/web/src/features/checkout/`).
- **Painel do dono**: configuração do programa (`apps/web/src/app/(painel)/painel/config`)
  e extrato com ajuste na ficha do cliente (`apps/web/src/features/painel-clientes/`).
- **Vitrine**: no máximo um aviso curto quando o programa estiver ligado. O
  rodapé "Programa Fidelidade" do Stitch só aparece se Q-12501 for "sim".

Os textos usam o nome escolhido em Q-12502. Nada de números, prazos ou
promessas copiados do Stitch (P-105).

## 7. Riscos

| Risco                                        | Mitigação                                                                     | Como detectar                                |
| -------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| Benefício creditado duas vezes               | Chave única por pedido e tipo; inserir sem duplicar                           | AC-12503 e AC-12512                          |
| Dois resgates usando o mesmo saldo           | Débito condicional na linha de saldo, na mesma transação                      | AC-12508                                     |
| Vazamento entre lojas ou entre clientes      | RLS por loja e por conta; função de extrato sem identificador vindo de fora   | AC-12516, AC-12517 e varredura de isolamento |
| Funcionário gerando benefício falso          | Pedido manual sem crédito por padrão; canal e autor gravados; sem autocrédito | AC-12505, AC-12506 e Q-12513                 |
| Ajuste ou configuração indevidos             | Só o dono, com validação, teto e auditoria                                    | AC-12513 e AC-12514                          |
| Concluir pedido travado por erro do programa | Crédito que nunca lança erro por configuração; alternativa outbox             | AC-12504                                     |
| Saldo dividido entre fichas da mesma pessoa  | Pergunta sobre junção; sem migração automática pelo telefone                  | AC-12519 e Q-12509                           |
| Passivo da loja crescendo sem fim            | Validade opcional e teto de resgate                                           | AC-12522 e Q-12506                           |
| Critério de banco tomado como provado        | Cada critério diz a prova esperada; suposição ASM-12502                       | `onp-spec audit` mostra o critério sem prova |

## 8. Estratégia de testes (quando a implementação for autorizada)

- **Parte pura** em `packages/core/src/fidelidade.onp.test.ts` (arquivo novo),
  lida pelo verify (projeto `unit`): crédito, limite do desconto, resgate acima
  do saldo, cópia da regra, pedido manual, autocrédito, vencimento. Cobre
  AC-12502, AC-12503 (cálculo), AC-12505, AC-12506, AC-12507, AC-12510,
  AC-12515 e AC-12522 (cálculo).
- **Parte de banco** em `apps/api/tests/` como `*.int.test.ts` (projeto
  `api-int`): crédito único, concorrência, repetição do envio, devolução,
  livro imutável, RLS entre clientes e entre lojas, autorização, privacidade,
  importação e rotina de expiração. Hoje o verify não lê esse projeto
  (ASM-12502). Para valer como prova é preciso pedir ao gerente a mudança do
  `onpspec.config.json`.
- Título de cada teste: `it("[CA-n] @spec:AC-125xx …")`, com as duas
  convenções.
- A varredura `apps/api/tests/isolamento-varredura.test.ts` ganha os
  construtores das tabelas novas.
