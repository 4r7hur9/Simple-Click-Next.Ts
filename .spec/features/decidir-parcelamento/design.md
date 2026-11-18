# Design: Parcelamento, boleto e novas condições de pagamento (A decidir)

> feature: decidir-parcelamento

<!--
  Card #126, bloco de códigos 12601 a 12699. Função "A decidir" (P-107):
  tudo abaixo é proposta. Nenhuma tarefa do redesign depende deste documento.
  Os caminhos são relativos a /Users/stargrupo/Projetos/SC.
  Fato = lido no código com o símbolo citado. Inferência = conclusão a partir
  dos fatos. Desconhecido = precisa de decisão ou de validação externa.
  O texto da alternativa B evita de propósito os nomes de campo de dados de
  cartão que infra/tests/sem-cobranca.test.ts procura em todo arquivo versionado.
-->

## 1. Estado atual (fatos)

### 1.1 Formas e configuração

- Formas aceitas: PIX, dinheiro e cartão na entrega. Lista em
  `packages/contracts/src/store-settings.ts`, símbolo
  `FORMAS_DE_PAGAMENTO_DA_LOJA`.
- Configuração: `esquemaDaConfiguracaoDePagamento` (mesmo arquivo), um
  `strictObject` com `formas[]` e `pix` (tipo, chave, titular). Rejeita forma
  repetida e PIX sem chave. Fica no JSON `store_settings.payment`.
- API da configuração: `apps/api/src/modules/stores/configuracao.routes.ts`
  (`GET` e `PUT /v1/lojas/:apelido/configuracao/pagamento`) e
  `apps/api/src/modules/stores/configuracoes.usecase.ts`, definição
  `pagamento`: `ler`, `gravar` (junta `{formas, pix}` ao JSON) e `sensiveis`
  (`["pix"]`) para a trilha. Tem uma segunda lista `FORMAS_CONHECIDAS`.
- Painel: `apps/web/src/features/config/FormularioPagamento.tsx` (lista fixa
  `FORMAS`).
- Equipe: `packages/contracts/src/permissoes.ts`, `MATRIZ_DE_PERMISSOES`, já
  tira "configurações" da equipe (STAFF).

### 1.2 Fechamento e pedido

- Oferta ao cliente: `apps/api/src/modules/storefront/fechamento.usecase.ts`,
  `fechamentoDaLoja`. Descarta forma que não está em `FORMAS_CONHECIDAS` e
  remove PIX sem chave.
- Isso lê `app.checkout_settings()`, criada em
  `packages/database/migrations/0019_fechamento_le_o_pagamento.sql`, que
  devolve a coluna `payment` inteira (com a chave PIX) para o fechamento. Quem
  filtra o que sai é o código, não o banco.
- Tela: `apps/web/src/features/checkout/SeletorDePagamento.tsx` e
  `apps/web/src/features/checkout/FechamentoDaCompra.tsx` (mapa
  `ROTULO_DO_PAGAMENTO`).
- Corpo do pedido online: `packages/contracts/src/carrinho.ts`,
  `esquemaDoPedidoParaCriar`: `formaDePagamento` é texto livre e
  `trocoParaCentavos` é inteiro.
- Rota: `apps/api/src/modules/orders/pedidos.routes.ts` grava a forma sem
  conferir se a loja a aceita. O total visto só gera log (`registrarDivergencia`,
  AC-504 legado); quem recusa é o subtotal.
- Código pronto e sem uso: `apps/api/src/modules/orders/pagamento.ts`,
  `montarPagamento` e `formasOferecidas` (recusa `FORMA_NAO_ACEITA`), em um
  modelo (`aceitaPix`, `aceitaDinheiro`) diferente do JSON real. Só os testes
  o chamam.
- Pedido manual: `packages/contracts/src/clientes.ts`,
  `esquemaDoPedidoManualParaCriar`, com enum próprio que inclui `OTHER`;
  rota `apps/api/src/modules/orders/pedido-manual.routes.ts`; tela
  `apps/web/src/features/painel-pedidos/MontarPedido.tsx`.
- Status de pagamento: `orders.payment_status` (migração
  `packages/database/migrations/0008_pedidos.sql`, CHECK
  `orders_pagamento_conhecido`: PENDING, AWAITING_PROOF, CONFIRMED, REFUNDED,
  FAILED). O comentário da migração diz que a coluna registra o que o dono
  confirmou ter recebido. Os seeds `packages/database/seed/pedidos.ts` gravam
  CONFIRMED. Nenhum código da API ou do web lê ou grava a coluna.
- Dinheiro: sempre centavos inteiros, `packages/core/src/dinheiro.ts`.

### 1.3 Onde a forma aparece (cada lugar com lista e rótulo próprios)

Contrato e núcleo: `packages/core/src/pedido-descrito.ts`
(`FormaDePagamento`), `packages/core/src/cupom-blocos-partes.ts`
(`NOME_DO_PAGAMENTO`), `packages/core/src/cupom-texto-blocos.ts`
(`nomeDoPagamento`, `blocoDePagamento`), `packages/contracts/src/acompanhamento.ts`.

API: `apps/api/src/modules/orders/pagamento.ts`,
`apps/api/src/modules/orders/checkout.schema.ts` (sem uso em produção),
`apps/api/src/modules/orders/pedido-fechado.usecase.ts` e `pedidos.routes.ts`
(ambos trocam a forma ausente por dinheiro com `?? "CASH"` e `as never`),
`apps/api/src/modules/printing/pedido-para-cupom.ts`,
`apps/api/src/modules/orders/acompanhar.usecase.ts`,
`apps/api/src/modules/orders/quadro.usecase.ts`,
`apps/api/src/modules/orders/fila.routes.ts`,
`apps/api/src/modules/metrics/consultas.ts` (`vendasPorPagamento`).

Web: `apps/web/src/features/pedido/AcompanhamentoDoPedido.tsx`,
`apps/web/src/lib/quadro-de-pedidos.ts`, `apps/web/src/lib/metricas.ts`,
`apps/web/src/features/loja/sobre/SecoesDoSobre.tsx`,
`apps/web/src/features/feed-config/PreviaNoFeed.tsx`,
`apps/web/src/features/painel-pedidos/MontarPedido.tsx`.

Banco: o cupom do agente de impressão sai da função SQL
`app.cupom_do_trabalho` (migração
`packages/database/migrations/0068_atacado_no_cupom.sql`), que já leva
`paymentMethod` e `changeForCents`.

### 1.4 O que não existe

Nada de parcelamento, boleto, desconto à vista, juros ou integração com meio de
pagamento. "Parcela" no código quer dizer "parte de uma soma". Webhook é só uma
fila declarada, sem processador (`apps/api/src/jobs/index.ts`).

### 1.5 Restrições que já existem

- Decisão legada AC-513 (`arquivo/spec/features/pedido-checkout/spec.md`): a
  versão 1 não cobra nem pede dado de cartão.
- `infra/tests/sem-cobranca.test.ts` falha a build se houver biblioteca de
  cobrança nas dependências (`BIBLIOTECAS_DE_COBRANCA`) ou nome de campo de
  dado de cartão em arquivo versionado (`CAMPOS_DE_CARTAO`, inclui `.md`). Ele
  também lê `apps/api/src/modules/orders/pagamento.ts` e espera encontrar
  `CARD_ON_DELIVERY`.
- P-104: nada de função de oficina; o "boleto faturado para oficinas" do
  mockup fica fora. P-105: números e promessas do Stitch não são dado real.

## 2. Alternativa A — condições informadas pela loja, pagas fora do sistema

É a base dos critérios da spec. Mantém AC-513: o sistema não cobra.

### 2.1 Opções de condição (para o usuário escolher em Q-12603 e Q-12604)

Os campos abaixo são **opções**, não requisitos:

- Parcelamento: máximo de parcelas, até quantas sem acréscimo, taxa de
  acréscimo, parcela mínima.
- Boleto combinado: a loja envia o boleto fora do sistema; o sistema só
  registra a escolha.
- Desconto à vista: percentual ou valor, com teto.
- Limites sugeridos: 1 a 12 parcelas, acréscimo de 0 até um teto, desconto
  abaixo de 100%, parcela mínima positiva, poucas condições por loja. A
  validação do painel e da API recusa com 400 fora disso (AC-12605).

### 2.2 Contrato e compatibilidade

- Estender `esquemaDaConfiguracaoDePagamento` com um campo novo **opcional**
  (por exemplo `condicoes`), com padrão "sem condições". O JSON antigo
  `{formas, pix}` continua válido (AC-12604).
- Ordem de implantação: contrato e API antes da web, porque o esquema é
  estrito e a leitura descarta o que não conhece.
- O JSON `payment` guarda só o que o cliente pode ver. Credencial, token de
  provedor e taxa contratada nunca entram nele, porque `app.checkout_settings()`
  o entrega inteiro ao fechamento público.
- Saída pública: uma lista fixa de campos por condição (identificador, rótulo,
  máximo de parcelas, parcela mínima, indicação de acréscimo e os valores já
  calculados). Um teste prova que nada fora dela sai (AC-12603).
- A vitrine e a página do produto hoje não recebem dado de pagamento, de
  propósito. Mostrar um resumo (Q-12607) pede um caminho público próprio, sem
  PIX, e a atualização de `apps/api/tests/vitrine-sem-dado-sensivel.test.ts`.

### 2.3 Cálculo (função pura em packages/core)

- Função pura nova no core (arquivo novo ao lado de
  `packages/core/src/taxa-entrega.ts`, onde mora `calcularValores`), sem banco.
- Invariantes que valem para qualquer resposta de Q-12604 (AC-12610):
  1. a soma das parcelas é igual ao total a prazo;
  2. tudo em centavos inteiros e nunca negativo;
  3. o resto do arredondamento vai para a última parcela (ASM-12604);
  4. total menor que a parcela mínima não oferece parcelamento.
- Rótulo "sem juros": decidido pelo servidor, só quando o total a prazo é igual
  ao total à vista (AC-12609).
- Ordem do cálculo proposta: subtotal, cupom, frete, desconto de retirada,
  desconto ou acréscimo da condição, total. O desconto à vista acumular com
  cupom, fidelidade e atacado é Q-12608, combinada com #119 e #125 (o
  primeiro aprovado entre eles é dono do contrato de descontos).

### 2.4 Pedido: o que o cliente envia e o que o servidor decide

- O corpo ganha só o identificador da condição e o número de parcelas. Acréscimo,
  desconto, valor da parcela e total da condição nunca vêm do cliente, nem como
  "declaração"; o esquema é estrito (AC-12612).
- Reaproveitar `montarPagamento` e `formasOferecidas` por um adaptador do JSON
  real para o modelo deles, mantendo `apps/api/src/modules/orders/pagamento.test.ts`
  válido, em vez de criar uma regra paralela. `FechamentoParaFechar` (em
  `pedidos.routes.ts`) e as duas montagens em `apps/api/src/app.ts` passam a
  trazer a configuração de pagamento (AC-12615).
- Erros: condição inexistente, desativada ou de outra loja dão a mesma
  resposta 422 (AC-12613); condição alterada desde a tela dá 409 (AC-12614).
  O 409 usa campos próprios da condição e **não** muda o AC-504: o total
  divergente fora da condição continua só em log.
- Chave de repetição: a repetição devolve o pedido já gravado, com a condição
  gravada (AC-12616). Hoje o pedido da chave é procurado antes de qualquer
  conferência.
- Pedido manual: mesma regra, só condições configuradas, sem acréscimo ou
  desconto livre (AC-12617, Q-12610). Tocar `clientes.ts`,
  `pedido-manual.routes.ts` e `MontarPedido.tsx`.

### 2.4.1 Retrato no pedido (migração aditiva)

- Colunas novas **anuláveis**, sem preencher pedidos antigos (nulo = pedido sem
  condição, AC-12620): rótulo, número de parcelas, valor de cada parcela,
  acréscimo em centavos, desconto da condição em centavos e total a prazo.
- CHECK de valor não negativo nas colunas novas (a `orders_valores_nao_negativos`
  atual não as cobre).
- Acompanhamento, painel, mensagem e cupom leem esse retrato e nunca a
  configuração atual da loja (AC-12619).

### 2.5 Status de pagamento

- O sistema nunca marca CONFIRMED sozinho; só uma ação do dono, auditada
  (AC-12618). Isso respeita o significado da coluna na migração 0008.
- Os seeds hoje gravam CONFIRMED para pedidos concluídos. Quando a coluna for
  exibida, ou o seed deixa de confirmar condição combinada, ou "confirmado"
  passa a significar "o dono confirmou o recebimento".
- Pagamento parcial (parcelas recebidas) pediria novos status e migração do
  CHECK: fora da alternativa A (ASM-12607, Q-12611).

### 2.6 Dinheiro nas métricas

- O acréscimo não deve entrar como venda: colunas separadas, e
  `vendasPorPagamento` em `apps/api/src/modules/metrics/consultas.ts` decide o
  que somar (AC-12621, Q-12609). Tocar também `apps/web/src/lib/metricas.ts`.

### 2.7 Autorização e trilha

- Só o dono altera as condições; STAFF recebe 403 e nada vai para a trilha
  (AC-12606).
- As condições entram em `ler`, `gravar` e `sensiveis` da definição `pagamento`
  de `configuracoes.usecase.ts`, com antes e depois na trilha (AC-12607). Sem
  isso o campo novo nem é salvo.

### 2.8 Fonte única das formas e dos rótulos

A lista da seção 1.3 tem uns 15 lugares, com rótulos diferentes ("Dinheiro" e
"Dinheiro na entrega"). Proposta: uma fonte única em `packages/contracts` com
formas e rótulos, usada por todos, e **nenhuma** troca silenciosa por dinheiro
(`?? "CASH"`, `as never`). Forma ou condição nova que não tenha rótulo deve
falhar em teste, não aparecer como "Dinheiro" (AC-12619). Mover ou apagar
`orders/pagamento.ts` exige ajustar `infra/tests/sem-cobranca.test.ts`.

### 2.9 Cupom do agente de impressão

`app.cupom_do_trabalho` precisa de migração nova com `CREATE OR REPLACE`, depois
da migração das colunas, e de um teste de paridade entre a impressão pelo clique
(`packages/core`) e a pelo agente (AC-12619).

### 2.10 Consumidor e texto

- A tela mostra preço à vista, número e valor das parcelas, acréscimos e total a
  prazo (AC-12608). A base legal (Código de Defesa do Consumidor, art. 52, e o
  decreto que o regulamenta) é inferência a validar com jurídico (ASM-12605).
- Boleto: sem CPF e sem linha digitável guardada (ASM-12603). Se um dia guardar,
  é dado sensível: mascarado na trilha, fora do acompanhamento público e fora da
  URL do WhatsApp (Q-12605).

## 3. Alternativa B — cobrança online (só análise, sem critérios)

Depende de Q-12602 e Q-12606. Nenhum critério foi escrito.

- **Conflito:** contraria AC-513 e faz `infra/tests/sem-cobranca.test.ts` falhar
  (bibliotecas de cobrança e campos de dado de cartão). Adotar B exige o usuário
  revogar essa decisão e mudar o teste.
- **Pré-condições de segurança:**
  1. formulário hospedado pelo provedor ou redirecionamento (nível mais simples
     do padrão de segurança de cartões), sem nunca guardar, registrar em log ou
     fazer passar pela API o número ou o código do cartão;
  2. retorno do provedor por webhook com assinatura, carimbo de tempo contra
     reenvio e idempotência pelo identificador do evento;
  3. `payment_status` só muda por webhook verificado ou ação auditada do dono;
  4. credencial por loja cifrada, girável e **fora** de `store_settings`;
  5. reembolso só pelo dono, auditado;
  6. contestação de compra (chargeback);
  7. provedor como operador na LGPD, com contrato;
  8. repasse por subconta, para a plataforma não custodiar dinheiro da loja.
- **Desconhecido:** provedor, taxas, prazos de repasse, custo e responsável por
  ele (Q-12606).

## 4. Comparação resumida

| Item                        | A: combinado fora | B: online                   |
| --------------------------- | ----------------- | --------------------------- |
| Mantém a decisão AC-513     | sim               | não, exige revogar          |
| Dependência externa         | nenhuma           | provedor, contrato, taxas   |
| Quem confirma o recebimento | o dono            | o provedor, por webhook     |
| Risco de dado sensível      | baixo             | alto, exige revisão própria |
| Serve de base para o outro  | sim               | reaproveita 2.3 a 2.8       |

## 5. Riscos

| Risco                                                             | Mitigação                                                       |
| ----------------------------------------------------------------- | --------------------------------------------------------------- |
| Cliente adultera acréscimo, desconto ou total da condição         | O servidor recalcula; esquema estrito; 422 (AC-12612)           |
| Condição de outra loja ou desativada                              | Mesma recusa para os três casos (AC-12613)                      |
| Campo novo some em silêncio entre web e API de versões diferentes | Campos opcionais, JSON antigo válido, API antes da web          |
| Segredo ou dado interno sai no fechamento público                 | Lista fixa de campos e teste de resposta (AC-12603)             |
| Acréscimo infla o faturamento                                     | Colunas separadas e decisão de Q-12609                          |
| Forma nova aparece como "Dinheiro" em cupom ou mensagem           | Fonte única e fim das trocas silenciosas (AC-12619)             |
| Promessa de "sem juros" falsa                                     | Rótulo calculado pelo servidor (AC-12609)                       |
| Conflito de arquivos com #110, #107, #119 e #125                  | #126 só entra depois deles; descontos seguem o dono do contrato |
| Spec ser lida como decisão aprovada                               | Status rascunho, perguntas abertas, P-107                       |

## 6. Estratégia de testes (quando houver autorização)

- Testes só com nome `*.onp.test.ts` ou `*.onp.test.tsx`, título no formato
  `[CA-n] @spec:AC-126xx ...`, nas pastas lidas por `onpspec.config.json`.
- Unidade (projeto `unit`): função de parcelas, com teste por propriedade
  (1x, total menor que a parcela mínima, total ímpar, soma igual ao total).
- Web (projeto `web`): seletor e fechamento, painel de condições, rótulos.
- Banco e API (projeto `api-int`) não são lidos pelo `onp-spec verify` atual;
  prova desses critérios depende de decisão do gerente e do usuário sobre a
  config.
- Testes existentes que precisam continuar valendo:
  `infra/tests/sem-cobranca.test.ts`, `apps/api/src/modules/orders/pagamento.test.ts`,
  `apps/web/tests/seletor-de-pagamento.test.tsx`,
  `apps/web/tests/config-pagamento.test.tsx`,
  `apps/api/tests/config-pagamento.int.test.ts` e
  `apps/api/tests/vitrine-sem-dado-sensivel.test.ts`.

## 7. Coordenação com outros cards

- #110 (sacola e fechamento) e #107 (vitrine) mexem em `FechamentoDaCompra.tsx` e
  na grade de produtos; a matriz do #103 (`.spec/features/stitch-planejamento/design.md`)
  atribui "10x sem juros" e "boleto a prazo" a este card. O bloco visual fica
  oculto até a decisão (P-107).
- #119 (cupons) e #125 (fidelidade) combinaram um contrato de descontos do
  pedido em `packages/core/src/taxa-entrega.ts`; o desconto à vista segue o
  mesmo dono (Q-12608).
