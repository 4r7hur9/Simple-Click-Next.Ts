# Spec: Programa de fidelidade do cliente (A decidir)

> feature: decidir-fidelidade
> status: rascunho

<!--
  Card #125 do RM Board. Bloco de códigos deste card: 12501 a 12599.
  Função "A decidir" (P-107): nada aqui está aprovado. Esta spec descreve o
  comportamento PROPOSTO para o usuário decidir se faz e como faz. Nenhuma
  tarefa do redesign (#104–#114) depende dela.
  Cada critério indica a prova esperada:
  - "unitária": função pura do core, lida pelo onp-spec verify;
  - "banco": teste de integração com banco (projeto api-int), que o verify
    atual NÃO lê (ver ASM-12502).
-->

## Contexto

O SimpleClick permite criar, personalizar e administrar lojas de qualquer
segmento e receber pedidos. O rodapé desktop do redesign Stitch cita um
"Programa Fidelidade", mas o SimpleClick não tem nenhum programa de
fidelidade hoje (ver design.md, "Estado atual"). Favoritos não são
recompensa.

A proposta é um benefício de recompra que a loja oferece aos seus clientes:
pontos, carimbos ou outro modelo que o usuário escolher. Inclui as regras, o
extrato, o resgate, a expiração e o que acontece quando um pedido é
cancelado. Cashback e carteira em dinheiro não estão presumidos.

Os critérios abaixo valem para qualquer modelo escolhido. Onde se lê
"benefício", entenda pontos, carimbos ou a unidade decidida em Q-12502.

## Histórias

### US-12501 — Cliente acompanha o próprio benefício

Como cliente recorrente de uma loja, quero ver quanto benefício tenho e de
onde ele veio, para entender como acumular e quando posso usar.

#### AC-12501 — O cliente vê o saldo e o extrato só da própria conta

- **Dado** um cliente logado com benefício em uma loja que tem o programa ligado
- **Quando** ele abre a área de fidelidade da conta
- **Então** vê o saldo de cada loja e um extrato com crédito, resgate,
  devolução, ajuste e expiração, cada um com data e pedido
- **E** o extrato só mostra lançamentos das fichas ligadas à conta dele

Prova: banco.

#### AC-12502 — Loja sem programa não mostra nada

- **Dado** uma loja em que o dono não ligou o programa, ou em que a
  plataforma o desligou
- **Quando** um cliente abre a loja, o fechamento do pedido ou a conta
- **Então** nenhum bloco, selo ou texto de fidelidade aparece
- **E** nenhum pedido da loja gera benefício

Prova: unitária.

### US-12502 — Benefício creditado por pedido elegível

Como cliente, quero receber o benefício quando o meu pedido for concluído,
uma única vez, para confiar no saldo que aparece.

#### AC-12503 — Pedido concluído credita o benefício uma única vez

- **Dado** um pedido elegível de um cliente com conta, numa loja com o
  programa ligado
- **Quando** a loja muda o pedido para Concluído
- **Então** o benefício é creditado uma única vez, com a cópia da regra que
  valia na hora
- **E** repetir o processamento do mesmo pedido não cria um segundo crédito

Prova: unitária (cálculo) e banco (crédito único por pedido).

#### AC-12504 — Concluir o pedido nunca falha por causa da fidelidade

- **Dado** uma loja com a configuração do programa ausente, desligada ou
  inválida
- **Quando** a equipe conclui um pedido
- **Então** o pedido é concluído normalmente
- **E** nenhum benefício é creditado e nenhum erro de fidelidade aparece para
  a equipe

Prova: banco.

#### AC-12505 — Pedido lançado pela equipe não gera benefício sem decisão do dono

- **Dado** um pedido manual, lançado pela equipe no painel
- **Quando** ele é concluído e o dono não ligou o crédito para pedidos manuais
- **Então** nenhum benefício é creditado
- **E** todo crédito guarda o canal do pedido e quem o concluiu

Prova: unitária.

#### AC-12506 — Ninguém credita benefício para si mesmo

- **Dado** um pedido cuja ficha de cliente pertence à mesma conta de quem
  está concluindo o pedido (por exemplo, um funcionário comprando na loja
  onde trabalha)
- **Quando** essa pessoa conclui o pedido
- **Então** nenhum benefício é creditado

Prova: unitária.

### US-12503 — Usar o benefício no fechamento do pedido

Como cliente, quero usar o meu benefício para pagar menos no fechamento, sem
correr o risco de o sistema me dar mais do que eu tenho.

#### AC-12507 — Resgate acima do saldo é recusado

- **Dado** um cliente com saldo menor que o resgate pedido
- **Quando** ele tenta usar o benefício no fechamento
- **Então** o resgate é recusado com o aviso "saldo insuficiente"
- **E** nenhum desconto nem lançamento é criado

Prova: unitária.

#### AC-12508 — Dois resgates ao mesmo tempo não usam o mesmo saldo

- **Dado** um cliente com saldo suficiente para um único resgate
- **Quando** dois pedidos com resgate são enviados ao mesmo tempo
- **Então** só um deles recebe o desconto
- **E** o saldo nunca fica negativo

Prova: banco.

#### AC-12509 — Repetir o envio do pedido não desconta duas vezes

- **Dado** um pedido com resgate já criado
- **Quando** o mesmo envio chega de novo, com a mesma chave de repetição
- **Então** o pedido existente é devolvido
- **E** o saldo é debitado uma única vez

Prova: banco.

#### AC-12510 — O desconto nunca passa do valor dos produtos

- **Dado** um resgate maior que o subtotal menos os outros descontos do pedido
- **Quando** o total do pedido é calculado
- **Então** o desconto da fidelidade é limitado a esse valor
- **E** o total do pedido nunca fica negativo, e o desconto aparece separado
  no resumo e no cupom impresso

Prova: unitária.

### US-12504 — Cancelamento mantém o extrato coerente

Como cliente e como dono da loja, quero que um pedido cancelado não deixe
benefício a mais nem a menos, para que o saldo continue confiável.

#### AC-12511 — Pedido cancelado devolve o benefício usado, uma única vez

- **Dado** um pedido com resgate que ainda não foi concluído
- **Quando** a loja cancela o pedido
- **Então** o benefício usado volta ao saldo com um lançamento de devolução,
  no mesmo momento em que o estoque é devolvido
- **E** um segundo processamento do cancelamento não devolve de novo

Prova: banco.

#### AC-12512 — O extrato só cresce e o saldo bate com ele

- **Dado** qualquer sequência de créditos, resgates, devoluções, ajustes e
  expirações
- **Quando** alguém tenta alterar ou apagar um lançamento
- **Então** o banco recusa a alteração
- **E** o saldo de cada cliente é igual à soma dos lançamentos dele

Prova: banco.

### US-12505 — Dono da loja configura o programa

Como dono da loja, quero ligar o programa e definir as regras, para oferecer
o benefício do jeito que cabe no meu negócio.

#### AC-12513 — Só o dono configura a regra

- **Dado** uma loja com o programa permitido pela plataforma
- **Quando** um funcionário ou um cliente tenta ligar, desligar ou mudar a regra
- **Então** a tela avisa "você não tem acesso" (resposta 403)
- **E** quando o dono muda a regra, os valores são validados com limites e a
  mudança fica registrada na auditoria da loja

Prova: banco.

#### AC-12514 — Ajuste manual só pelo dono, com motivo e registro

- **Dado** o dono na ficha de um cliente
- **Quando** ele ajusta o saldo informando um motivo, dentro do teto definido
- **Então** um lançamento de ajuste aparece no extrato e uma linha com antes
  e depois fica na auditoria da loja
- **E** um funcionário que tenta ajustar recebe "você não tem acesso" (403)

Prova: banco.

#### AC-12515 — Mudar a regra não altera o passado

- **Dado** lançamentos criados com uma regra antiga
- **Quando** o dono muda a regra
- **Então** os lançamentos antigos continuam com os valores e a regra da época
- **E** só os pedidos concluídos depois da mudança usam a regra nova

Prova: unitária.

### US-12506 — Benefício protegido contra uso indevido

Como dono da loja, quero que o benefício de um cliente não possa ser visto,
usado ou criado por outra pessoa, para não ter prejuízo nem vazamento.

#### AC-12516 — Um cliente não vê nem usa o saldo de outro

- **Dado** dois clientes, na mesma loja ou em lojas diferentes
- **Quando** o cliente A pede o extrato ou tenta resgatar informando qualquer
  identificador do cliente B
- **Então** recebe só os próprios dados e o resgate só usa o próprio saldo
- **E** uma loja nunca lê lançamentos de outra loja

Prova: banco.

#### AC-12517 — A página pública do pedido não mostra saldo

- **Dado** o link público de acompanhamento de um pedido
- **Quando** alguém sem login abre esse link
- **Então** a página não mostra saldo nem extrato de fidelidade

Prova: banco.

#### AC-12518 — Importar clientes não cria saldo

- **Dado** o dono importando uma planilha de clientes
- **Quando** a importação termina
- **Então** nenhum lançamento de fidelidade é criado

Prova: banco.

#### AC-12519 — O saldo não muda de dono pelo telefone

- **Dado** uma ficha sem conta com benefício acumulado
- **Quando** alguém cria uma conta com o mesmo telefone
- **Então** o saldo não passa para essa conta sem a regra decidida em Q-12509

Prova: banco.

### US-12507 — Privacidade dos dados do programa

Como cliente, quero que meus dados de fidelidade sigam os mesmos direitos de
privacidade da minha conta.

#### AC-12520 — A exportação de dados inclui o extrato

- **Dado** um cliente com lançamentos de fidelidade
- **Quando** ele pede a exportação dos seus dados
- **Então** o arquivo inclui o saldo e o extrato de cada loja

Prova: banco.

#### AC-12521 — Excluir a conta encerra o saldo sem apagar o histórico

- **Dado** um cliente com saldo que pede a exclusão da conta
- **Quando** a conta é anonimizada
- **Então** o saldo é zerado por um lançamento de encerramento
- **E** nenhum lançamento é apagado e nenhum lançamento guarda nome, telefone
  ou e-mail

Prova: banco.

### US-12508 — Benefício com validade

Como dono da loja, quero, se eu decidir assim, que o benefício vença depois
de um prazo, para não carregar um compromisso sem fim.

#### AC-12522 — Benefício vencido sai do saldo uma única vez

- **Dado** uma loja com prazo de validade ligado e um crédito vencido
- **Quando** a rotina de expiração roda, loja por loja
- **Então** um lançamento de expiração tira do saldo só a parte vencida
- **E** rodar a rotina de novo não expira duas vezes

Prova: unitária (cálculo do vencido) e banco (rotina idempotente).

## Fora de escopo

- Implementar código, criar testes, alterar banco, API ou dependências.
- Cashback em dinheiro, carteira monetária, saque ou transferência de saldo
  entre clientes (só se Q-12502 decidir).
- Programa compartilhado entre lojas (só se Q-12504 decidir, com outro
  desenho de isolamento).
- Estorno de pagamento depois de concluído (não existe hoje; ver Q-12507).
- Publicar conteúdo, assumir custos externos ou declarar decisões aprovadas.
- Commit, push, PR, merge, worktree ou troca de branch.

## Suposições

| ID        | Suposição                                                                                                                                                                   | Status | Resolução |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-12501 | Nenhuma regra comercial está decidida; as recomendações do design.md são propostas para o usuário revisar                                                                   | aberta | —         |
| ASM-12502 | Os critérios com prova "banco" ficam sem prova no onp-spec verify atual, que só roda os projetos web e unit; mudar a config é decisão do gerente e do usuário               | aberta | —         |
| ASM-12503 | A fidelidade não depende do card #119 (cupons): tem um contrato mínimo próprio de desconto, e o primeiro card aprovado entre #119 e #125 vira dono do contrato de descontos | aberta | —         |
| ASM-12504 | As funções existentes (favoritos, histórico do pedido, cupom impresso, quadro de pedidos, exportação e exclusão de conta) são preservadas e só ganham a parte de fidelidade | aberta | —         |
| ASM-12505 | As telas de fidelidade não estão no ZIP do Stitch; precisam de proposta visual própria com a base do card #104                                                              | aberta | —         |

## Perguntas em aberto

| ID      | Pergunta                                                                                                                                      | Status | Resposta |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-12501 | O SimpleClick vai ter programa de fidelidade?                                                                                                 | aberta | —        |
| Q-12502 | Qual modelo: pontos por valor gasto, carimbos por pedido, cashback ou outro?                                                                  | aberta | —        |
| Q-12503 | Quem paga o benefício: a loja ou a plataforma?                                                                                                | aberta | —        |
| Q-12504 | O programa é de cada loja ou compartilhado entre lojas? Compartilhar exige outro desenho de isolamento e nova revisão de segurança            | aberta | —        |
| Q-12505 | Em que momento o benefício é creditado? A proposta é quando o pedido fica Concluído                                                           | aberta | —        |
| Q-12506 | O benefício vence? Em quanto tempo, e o cliente é avisado antes?                                                                              | aberta | —        |
| Q-12507 | Se um dia existir estorno depois de concluído, o saldo pode ficar negativo e bloquear resgates ou a devolução só tira até o saldo que houver? | aberta | —        |
| Q-12508 | Pedido manual lançado pela equipe gera benefício? Ficha de cliente sem conta acumula?                                                         | aberta | —        |
| Q-12509 | Fichas duplicadas da mesma pessoa se juntam? O saldo de uma ficha sem conta pode passar para uma conta, e com qual confirmação?               | aberta | —        |
| Q-12510 | O benefício acumula com cupom (#119) e com preço de atacado? Em que ordem os descontos se aplicam?                                            | aberta | —        |
| Q-12511 | Em quais canais o resgate vale: site, pedido manual, repetir pedido?                                                                          | aberta | —        |
| Q-12512 | O que acontece com o saldo quando o dono remove a ficha do cliente?                                                                           | aberta | —        |
| Q-12513 | Há limite de benefício por cliente por dia e teto para o ajuste manual? Quais valores?                                                        | aberta | —        |
| Q-12514 | A função vale para todos os planos ou tem limite por plano?                                                                                   | aberta | —        |
| Q-12515 | O desconto do resgate fica numa coluna própria do pedido ou no desconto genérico que já existe?                                               | aberta | —        |
