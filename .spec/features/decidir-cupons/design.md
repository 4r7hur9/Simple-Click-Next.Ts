# Design: Cupons promocionais e carteira de cupons (A decidir)

> feature: decidir-cupons

<!--
  Card #119, bloco 11901 a 11999. PROPOSTA para revisão do dono do produto:
  nada aqui está aprovado nem autoriza implementação (P-107). Fatos citam
  caminho e linha lidos em 05/11/2026 em /Users/stargrupo/Projetos/SC;
  inferência e desconhecido vêm marcados. Arquivos que ainda não existem
  aparecem como "(novo)", sem crases.
  Revisão adversarial feita sobre o rascunho: arquitetura (18 achados) e
  segurança (16 achados), todos tratados nas seções 4 a 7.
-->

## 1. Origem no Stitch (ilustração, P-105)

Só o catálogo desktop traz o cupom na sacola: campo "Cupom de desconto"
com o exemplo preenchido, botão "Aplicar" e a linha "Desconto Cupom"
com valor zero. As telas de início e vitrine desktop trazem "Carteira &
Cupons" no rodapé. O código de exemplo, os valores e o texto não são
conteúdo real. Matriz geral: `.spec/features/stitch-planejamento/design.md`
(linhas 105, 216 e 241).

## 2. Estado atual (fatos)

| Tema                     | Evidência                                                                                                                                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cupom de desconto        | Não existe tabela, model, contrato, rota nem tela. O comentário de `packages/database/migrations/0005_pedidos.sql` (linha 9) previa `coupons` e `coupon_redemptions`, nunca criadas                                                                             |
| Colunas reservadas       | `coupon_discount_cents`, `coupon_id` (sem FK) e `coupon_code_snapshot` em `packages/database/migrations/0008_pedidos.sql` (linhas 102, 118 e 119) e `packages/database/prisma/schema.prisma` (501-513). Nenhum código as lê ou grava; só o seed grava 0 ou nulo |
| Ordem do cálculo         | Comentário em `0008_pedidos.sql` (linha 96): subtotal, cupom (só sobre o subtotal), frete, desconto de retirada, total                                                                                                                                          |
| Desconto genérico        | `discount_cents` já é gravado por `apps/api/src/modules/orders/criar-pedido.usecase.ts` (linha 374) a partir de `descontoEmCentavos`; a rota pública nunca o preenche e o impresso já o lê                                                                      |
| Total do pedido          | `calcularValores` em `packages/core/src/taxa-entrega.ts` (linha 170): total é subtotal mais taxa; o tipo `ResumoDeValores` não tem desconto                                                                                                                     |
| Subtotal no servidor     | `conferirCarrinho` em `packages/core/src/pedido-total.ts` (linha 192) e `conferirAntesDeFechar` em `apps/api/src/modules/cart/conferir-preco.usecase.ts` recalculam; o valor vindo da tela não entra                                                            |
| Rota do pedido           | `POST /v1/vitrine/:apelido/pedidos` em `apps/api/src/modules/orders/pedidos.routes.ts` (linha 251), como PUBLIC, numa transação: idempotência, conferência, `calcularValores`, `criarPedido`, `reservarEstoque`, conversão do carrinho                          |
| Divergência de total     | `totalVistoCentavos` só gera log (`pedidos.routes.ts`, linhas 362-367); só `subtotalVistoCentavos` divergente responde 409 `preco_divergente` (linhas 373-382)                                                                                                  |
| Contrato do pedido       | `esquemaDoPedidoParaCriar` em `packages/contracts/src/carrinho.ts` (linha 302), `strictObject` sem cupom                                                                                                                                                        |
| Conferência anônima      | `POST /:apelido/carrinho/conferencia` em `apps/api/src/modules/cart/carrinho.routes.ts` (linha 264) roda como PUBLIC, só com a sessão do carrinho                                                                                                               |
| Concorrência existente   | `app.reservar_estoque_do_pedido` (`0027_baixa_ignora_estoque_nao_controlado.sql`, linha 21, SECURITY DEFINER, UPDATE condicional); contador `app.proximo_numero_de_pedido` em `0008`; idempotência por `orders.idempotency_key`                                 |
| Preço por item           | Atacado e promoção são por item (`packages/core/src/preco-aplicavel.ts`, `preco-vigente.ts`, `atacado.ts`); não existe desconto no nível do pedido                                                                                                              |
| Dinheiro                 | Banco e Prisma em `bigint`; core e API em `number` inteiro, validado por `exigirCentavos` (`packages/core/src/dinheiro.ts`)                                                                                                                                     |
| Impresso (outro sentido) | `apps/api/src/modules/printing/*`, `packages/core/src/cupom-*.ts` e a função SQL `app.cupom_do_trabalho` (`0068_atacado_no_cupom.sql`, linha 17), lida pelo agente de impressão. Não traz `coupon_*`                                                            |
| Limite de tentativas     | `limitarTentativas` em `apps/api/src/core/limite.ts` (linha 479) existe e nenhuma rota `/v1/vitrine` o usa                                                                                                                                                      |
| Auditoria                | `app.audit_log` em `packages/database/migrations/0006_impressao_e_auditoria.sql` (linha 16)                                                                                                                                                                     |
| Permissões               | Rota fora de `PERMISSOES_POR_ROTA` (`apps/api/src/core/equipe-da-loja.ts`, linha 58) fica só para o dono                                                                                                                                                        |
| Isolamento em teste      | `apps/api/tests/isolamento-varredura.test.ts` reprova tabela com `store_id` fora de `CONSTRUTORES` (linha 172) e `CAMADAS`; `packages/database/tests/esquema-cobre-o-banco.test.ts` exige model Prisma                                                          |
| Tela de fechamento       | `apps/web/src/features/checkout/FechamentoDaCompra.tsx` (linha 278) calcula `totalNaTela` como subtotal mais taxa; o troco é validado contra ele (linhas 348-370)                                                                                               |
| Carteira                 | Não existe; o menu do cliente está em `apps/web/src/lib/quem-esta-logado.ts` (sem cupons)                                                                                                                                                                       |
| Prova no ONP             | `onpspec.config.json` roda só os projetos `web` e `unit`; testes com banco (`api-int`) não entram no `verify` (Q-11912)                                                                                                                                         |

Inferência: como o fechamento já é serializado por loja pela linha de
`store_sequences`, travar a linha do cupom não piora a contenção.
Desconhecido: toda regra comercial (Q-11901 a Q-11914).

## 3. Contrato "descontos do pedido" (combinado com #125)

Proposta acordada por `board_message` com o #125, ainda não aprovada:

- O cupom usa as colunas `coupon_*`; a fidelidade não (ela usa
  `discount_cents` ou coluna própria, pergunta aberta da spec dela).
- O dono do contrato (`calcularValores` e `ResumoDeValores`, em
  `packages/core/src/taxa-entrega.ts`) é o primeiro card aprovado entre #119
  e #125; o outro só acrescenta uma parcela.
- Fórmula proposta: total = subtotal − cupom + taxa − retirada − desconto,
  em `number` inteiro validado por `exigirCentavos`. No banco, CHECK
  `coupon_discount_cents <= subtotal_cents`, além do `>= 0` atual.
- A assinatura depende de Q-11903 (frete grátis muda "só sobre o subtotal")
  e Q-11907 (mínimo e frete grátis antes ou depois do cupom).

## 4. Modelo de dados proposto

- Tabela `coupons` (novo): por loja, com RLS no padrão canônico
  (`0050_feed_favoritos_e_recentes.sql`, linhas 67-89): código único por
  loja sem diferenciar maiúsculas, tipo, valor em centavos ou percentual,
  mínimo do pedido, início e fim, limite total, limite por cliente, ativo,
  privado, exclusão lógica (`deleted_at`), sem política DELETE. Valores
  validados também por CHECK (percentual de 1 a 100, valor maior que 0,
  início antes do fim, limites maiores ou iguais a 1).
- Tabela `coupon_redemptions` (novo): uma linha por uso, com índice único
  `(store_id, order_id)`, cupom, pedido, cliente da loja e identidade. Nos
  cupons com limite por cliente o cliente é obrigatório. Chave estrangeira
  do cliente com `ON DELETE SET NULL`, mantendo contagem agregada para o
  limite (retenção LGPD: anonimização da ficha alcança a redenção; prazo de
  retenção a decidir).
- Tabela `coupon_grants` (novo): concessão a uma pessoa (carteira e cupom
  privado), com `identity_id` e `store_id`, política "da própria pessoa" no
  padrão de `favorite_stores` (`0050`, linhas 123-153). A identidade vem
  sempre da sessão. A listagem entre lojas usa função SECURITY DEFINER com
  lista fechada de campos, no padrão de `feed_lojas`.
- `orders.coupon_id` ganha chave estrangeira só se a migration confirmar
  que não há órfãos; sem exclusão física de cupom, a FK não precisa de
  ação destrutiva.
- Cada tabela com `store_id` entra na mesma tarefa em `CONSTRUTORES` e
  `CAMADAS` (`coupon_redemptions` depois de `coupons` e `orders`) e ganha
  model Prisma. A varredura só testa contexto de loja: a carteira pede teste
  próprio entre identidades.

## 5. Consumo atômico e concorrência

Função `app.consumir_cupom` (nova migration), no padrão de
`app.reservar_estoque_do_pedido`:

- SECURITY DEFINER, `search_path` fixo, REVOKE de PUBLIC, GRANT só a
  `sc_app` e `sc_admin`.
- Defesas copiadas do 0027: `p_store_id` igual a `app.current_store_id()`;
  pedido com `public_token` igual ao do contexto, status `PENDING` e canal
  `ONLINE`; cupom da mesma loja.
- Desconto e cliente lidos do pedido gravado (`subtotal_cents`,
  `store_customer_id`), nunca de parâmetro.
- `FOR UPDATE` na linha do cupom, conferência dos limites total e por
  cliente por contagem dentro da trava, insert da redenção e incremento do
  contador. `lock_timeout` curto; ao estourar, 409 `cupom_ocupado` com nova
  tentativa.
- Ordem na transação do pedido: depois de `criarPedido` (o pedido precisa
  existir) e antes de `reservarEstoque`. A idempotência devolve o pedido
  antes de chegar aqui, e o índice único `(store_id, order_id)` garante que o
  uso não se duplica. Alterar cupom pelo painel nunca toca `store_sequences`.
- Pedido manual: o 0027 exige canal `ONLINE` e token público, então o pedido
  manual fica fora (Q-11910); se entrar, usa caminho próprio com papel de
  equipe, e o contrato manual rejeita o campo enquanto isso.
- Devolução do uso (Q-11906): tarefa condicional, no padrão de
  `apps/api/src/modules/orders/devolver-estoque.ts`, na mesma transação da
  troca de status e protegida contra devolver duas vezes.

## 6. Segurança

| Risco                            | Proposta                                                                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enumeração de códigos            | Validação só em rota autenticada, com `limitarTentativas` por IP, conta e loja (429 com espera crescente) e falhas no registro de segurança (AC-11905)               |
| Conferência anônima como oráculo | A conferência anônima ignora o cupom; só a rota autenticada aplica (AC-11905)                                                                                        |
| Vazamento de existência          | Cupom de outra loja e inexistente dão a mesma resposta `cupom_invalido`; estados distintos só para o dono do cupom (AC-11902)                                        |
| Confiar no valor da tela         | O contrato aceita só `codigoDoCupom`; o servidor recalcula. Com cupom, `descontoVistoCentavos` ou total visto divergente dá 409 (AC-11903). Hoje o total só vira log |
| Limite por cliente furado        | Cliente nulo recusa cupom com esse limite; contagem na trava (AC-11912)                                                                                              |
| Várias contas, primeira compra   | Risco aceito ou mitigado por telefone E.164 verificado, endereço normalizado e teto em R$ (Q-11905, Q-11909, Q-11913)                                                |
| Cupom privado vazado             | Só vale com concessão para a identidade da sessão; senão responde como inexistente (AC-11920)                                                                        |
| IDOR na carteira                 | Identidade da sessão, nunca parâmetro; detalhe de outra pessoa responde 404                                                                                          |
| Poder da equipe                  | Padrão só o dono; se houver permissão, a equipe não altera tipo, valor, limite nem validade (Q-11911, AC-11907)                                                      |
| Sem trilha                       | Criar, editar, desativar, devolver uso e aplicar em pedido manual gravam `app.audit_log` sem dado pessoal (AC-11910)                                                 |
| Injeção no texto                 | Código com regex fechada, em maiúsculas, sem Unicode nem quebra de linha: protege o WhatsApp e o impresso (AC-11906)                                                 |

## 7. Contratos e arquivos futuros (por card dono)

- Contrato (novo): cupons-promocionais, em `packages/contracts/src`, com
  nome distinto do impresso (`impressao.ts`). Pedido ganha `codigoDoCupom`
  e `descontoVistoCentavos`; motivos novos `cupom_invalido`,
  `desconto_divergente` e `cupom_ocupado`.
- API (novo): módulo cupons-promocionais em `apps/api/src/modules`, com CRUD
  do painel e validação na vitrine. A rota do painel entra em
  `PERMISSOES_POR_ROTA` (`apps/api/src/core/equipe-da-loja.ts`).
- Exibição, os quatro caminhos: resposta do POST e reenvio
  (`pedidos.routes.ts`, `respostaDoPedidoGuardado`), mensagem do WhatsApp,
  `apps/api/src/modules/printing/pedido-para-cupom.ts` e a função SQL
  `app.cupom_do_trabalho` (migration nova), com ajuste no agente de impressão.
- Web: painel em `/painel/cupons` (menu em
  `apps/web/src/features/painel/secoes-do-painel.ts`, fila do #112); campo de
  cupom, troco e PIX em `FechamentoDaCompra.tsx` e `carrinho-do-navegador.ts`
  (fila do #110); carteira em `/conta/cupons` (fila do #111).
- Fila de arquivos compartilhados: `packages/core/src/taxa-entrega.ts`
  (dono do contrato de descontos, ver seção 3) e
  `apps/api/src/modules/orders/pedidos.routes.ts` (pedir a vez por
  `board_message`).

## 8. Alternativas descartadas

- Contador com UPDATE condicional sem trava: não cobre o limite por cliente.
- Advisory lock: mais difícil de provar e de auditar que a trava de linha.
- Desconto rateado por item: quebra a ordem do 0008 e o registro de atacado.
- Reaproveitar `discount_cents` para o cupom: já tem uso e misturaria cupom
  com desconto manual no painel e no impresso.

## 9. Riscos, prova e retorno

- Prova: AC-11901 a AC-11905 e a lógica pura rodam em `unit` (core, contratos
  e rotas com acesso simulado). AC-11908, AC-11911, AC-11912, AC-11913 e
  AC-11920 exigem PostgreSQL e dependem de Q-11912; até lá, nenhum
  `@spec` vai em teste que o `verify` não executa. O impresso do agente é
  prova do projeto `agente`. Testes em `*.onp.test.ts(x)` com
  `[CA-n] @spec:AC-119xx` no título (README do #103).
- Riscos: contenção em cupom muito disputado (mitigada por trava curta);
  desconto contado duas vezes (fórmula explícita e CHECK); confusão com o
  cupom impresso (nomes "promocional"); colisão com o #125 (seção 3).
- Retorno da implementação futura: interruptor de cupom por loja e na
  plataforma, sem migration; só desativação lógica; pedidos gravados mantêm
  o snapshot; migrations só andam para frente, com a reversão descrita em
  texto e sem chave estrangeira destrutiva.
- Retorno desta etapa: apagar `.spec/features/decidir-cupons/`.

## 10. Rastreio

| Critérios           | Seções      |
| ------------------- | ----------- |
| AC-11901 a AC-11905 | 2, 3, 5 e 6 |
| AC-11906 a AC-11910 | 4 e 6       |
| AC-11911 a AC-11913 | 5           |
| AC-11914 a AC-11917 | 7           |
| AC-11918 a AC-11920 | 4 e 6       |
