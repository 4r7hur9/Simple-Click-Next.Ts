# Spec: Parcelamento, boleto e novas condições de pagamento (A decidir)

> feature: decidir-parcelamento
> status: rascunho

<!--
  Card #126 do RM Board. Bloco de códigos deste card: 12601 a 12699.
  Função "A decidir" (P-107): nada aqui está aprovado. Esta spec descreve o
  comportamento PROPOSTO para o usuário decidir se faz e como faz. Nenhuma
  tarefa do redesign (#104–#114) depende dela.
  Pergunta-mãe: Q-10305 (stitch-planejamento), que pergunta quais funções "A
  decidir" entram. Q-12601 só fica respondida depois dela.
  Os critérios valem para a alternativa A do design.md (condições informadas
  pela loja e pagas fora do sistema). A alternativa B (checkout online) é só
  análise: nenhum critério foi escrito para ela porque depende de Q-12602.
  Onde um critério depende de uma pergunta, ele diz qual.
-->

## Contexto

O SimpleClick permite criar, personalizar e administrar lojas de qualquer
segmento e receber pedidos. Hoje a loja aceita PIX, dinheiro e cartão na
entrega, e o pagamento é combinado entre cliente e loja fora do sistema (ver
design.md, "Estado atual"). Os mockups do Stitch anunciam "10x sem juros",
"boleto a prazo" e "desconto à vista", que o produto não oferece.

A proposta é deixar a loja informar condições que ela realmente aceita (por
exemplo parcelamento e boleto combinado) e mostrar ao cliente, de forma
fiel, o número de parcelas, o valor e o total antes de confirmar o pedido.
Se o usuário preferir cobrar online de verdade, a alternativa B do design.md
lista o que isso exigiria. Universokar e autopeças nos mockups são só
exemplo visual: a função serve a lojas de qualquer ramo.

Os números, prazos e promessas dos mockups não são dado real (P-105).

## Histórias

### US-12601 — Cliente vê só condições que a loja realmente aceita

Como cliente, quero saber quais condições de pagamento a loja realmente
aceita, para não ser surpreendido ao fechar o pedido.

#### AC-12601 — Loja sem condições não mostra nenhuma promessa

- **Dado** uma loja que não configurou parcelamento, boleto nem desconto à vista
- **Quando** o cliente abre a vitrine, a página do produto, o "Sobre" ou o fechamento
- **Então** nenhum texto, selo ou opção de parcelamento, boleto ou desconto à vista aparece
- **E** as formas atuais (PIX, dinheiro, cartão na entrega) aparecem como hoje

#### AC-12602 — Condição configurada aparece igual ao que a loja definiu

- **Dado** uma loja com uma condição ativa, por exemplo parcelamento em até 3 vezes
- **Quando** o cliente consulta o pagamento no fechamento
- **Então** vê exatamente essa condição, com o rótulo e os limites definidos pela loja
- **E** o "Sobre" lista a mesma condição, sem número que a loja não definiu
- **E** a vitrine e a página do produto só mostram um resumo se Q-12607 for respondida a favor

#### AC-12603 — A resposta pública só traz campos permitidos das condições

- **Dado** uma loja com condições ativas
- **Quando** qualquer visitante lê as condições pela rota pública
- **Então** a resposta contém só os campos da lista fixa do design.md
- **E** não contém chave PIX fora do fechamento, credencial, taxa contratada nem dado de outra loja

### US-12602 — Lojista configura as condições

Como dono da loja, quero configurar as condições de pagamento que aceito,
para que o cliente veja só o que eu realmente cumpro.

#### AC-12604 — Dono salva condições e as formas atuais continuam valendo

- **Dado** o dono da loja na configuração de pagamento
- **Quando** ele ativa uma condição válida e salva
- **Então** a condição fica gravada e aparece no fechamento
- **E** PIX, dinheiro, cartão na entrega, a chave PIX e o troco continuam funcionando como antes
- **E** uma loja com a configuração antiga (só formas e PIX) continua válida, sem nenhuma condição ligada

#### AC-12605 — Valores fora dos limites são recusados

- **Dado** o dono salvando uma condição
- **Quando** ele informa número de parcelas, encargo, parcela mínima ou desconto fora dos limites do design.md
- **Então** a tela mostra a mensagem do campo e a API responde 400
- **E** nada é gravado

#### AC-12606 — A equipe não altera as condições

- **Dado** um membro da equipe (STAFF) logado na loja
- **Quando** ele tenta alterar as condições de pagamento
- **Então** recebe "você não tem acesso" (403) e nada é gravado nem entra na trilha

#### AC-12607 — Alterar uma condição deixa registro de antes e depois

- **Dado** o dono alterando encargo, desconto ou limite de parcelas
- **Quando** ele salva
- **Então** a trilha de auditoria registra o valor anterior e o novo, marcado como alteração sensível
- **E** se o registro na trilha falhar, a alteração inteira é desfeita

### US-12603 — Cliente escolhe a condição e confere os valores

Como cliente, quero ver quanto pago à vista e a prazo antes de confirmar,
para decidir com clareza.

#### AC-12608 — O cliente vê parcelas, valor e total antes de confirmar

- **Dado** uma loja com parcelamento que tem acréscimo
- **Quando** o cliente seleciona a condição no fechamento
- **Então** vê o preço à vista, o número de parcelas, o valor de cada parcela, o acréscimo e o total a prazo
- **E** o botão de confirmar só age depois de esses valores estarem na tela

#### AC-12609 — "Sem juros" só aparece quando é verdade

- **Dado** uma condição de parcelamento
- **Quando** o total a prazo é igual ao total à vista
- **Então** o rótulo "sem juros" aparece, calculado pelo servidor
- **E** quando o total a prazo é maior, o rótulo não aparece
- **E** o lojista não consegue escrever esse rótulo como texto livre

#### AC-12610 — A soma das parcelas é igual ao total

- **Dado** qualquer total e qualquer número de parcelas permitido
- **Quando** o valor das parcelas é calculado
- **Então** a soma das parcelas é igual ao total a prazo, em centavos inteiros
- **E** nenhuma parcela é negativa e a diferença de arredondamento fica numa parcela definida no design.md

#### AC-12611 — O texto deixa claro que o pagamento é combinado com a loja

- **Dado** uma condição que não é cobrada pelo sistema
- **Quando** o cliente a escolhe
- **Então** a tela diz que o pagamento é combinado com a loja, fora do SimpleClick
- **E** nenhuma condição vem ligada de fábrica

### US-12604 — O servidor recalcula e protege a condição

Como dono da loja, quero que o sistema recalcule a condição no servidor,
para que ninguém consiga um acréscimo ou desconto que eu não definiu.

#### AC-12612 — O cliente só envia a condição escolhida e o número de parcelas

- **Dado** um pedido online com condição
- **Quando** o corpo traz acréscimo, desconto, valor de parcela ou total da condição, ou campo desconhecido
- **Então** o pedido é recusado (422) e nada é gravado
- **E** o servidor recalcula os valores da condição a partir da configuração atual da loja

#### AC-12613 — Condição inexistente, desativada ou de outra loja é recusada igual

- **Dado** um pedido que cita uma condição desativada, inexistente ou de outra loja
- **Quando** ele é enviado
- **Então** a resposta é a mesma recusa (422) para os três casos
- **E** a resposta não revela que a condição existe em outra loja

#### AC-12614 — Condição alterada desde a tela pede nova conferência

- **Dado** que o dono alterou ou desativou a condição depois de o cliente abrir o fechamento
- **Quando** o cliente confirma o pedido
- **Então** o pedido é recusado (409) com aviso para conferir os valores de novo
- **E** a decisão do total divergente fora da condição (AC-504 legado) continua como hoje

#### AC-12615 — Forma de pagamento que a loja não aceita é recusada

- **Dado** um pedido com forma de pagamento que a loja não oferece
- **Quando** ele é enviado
- **Então** é recusado e nada é gravado
- **E** isso vale para qualquer texto, não só para as condições novas

#### AC-12616 — Repetir o envio devolve a condição já gravada

- **Dado** um pedido já criado com uma chave de repetição
- **Quando** o mesmo envio chega de novo, mesmo com outra condição no corpo
- **Então** a resposta devolve o pedido original, com a condição que ficou gravada
- **E** nenhum segundo pedido é criado

#### AC-12617 — O pedido de balcão usa o mesmo cálculo

- **Dado** um pedido manual criado pelo painel
- **Quando** ele registra uma condição
- **Então** só são aceitas condições configuradas, recalculadas pelo servidor
- **E** a equipe não cria condição avulsa, com acréscimo ou desconto livre (depende de Q-12610)

### US-12605 — O pedido não afirma liquidação que o sistema não confirmou

Como dono da loja, quero que o pedido mostre a condição combinada sem dizer
que o pagamento foi liquidado, para eu mesmo confirmar o recebimento.

#### AC-12618 — O sistema nunca marca "pago" sozinho

- **Dado** um pedido com condição combinada
- **Quando** ele é criado, avança de etapa ou é concluído
- **Então** o status de pagamento não vira confirmado automaticamente
- **E** só uma ação do dono, registrada na trilha, muda o status

#### AC-12619 — Acompanhamento, painel, mensagem e cupom mostram a condição gravada

- **Dado** um pedido criado com uma condição
- **Quando** o cliente abre o acompanhamento ou o dono vê o pedido, a mensagem do WhatsApp ou o cupom impresso
- **Então** todos mostram a condição e as parcelas gravadas no pedido
- **E** nenhum cai em "Dinheiro" por falta de rótulo
- **E** o cupom impresso pelo clique e o impresso pelo agente mostram o mesmo texto

#### AC-12620 — Pedidos antigos continuam como estavam

- **Dado** um pedido criado antes desta função
- **Quando** ele é aberto no acompanhamento, no painel ou no cupom
- **Então** é exibido como antes, sem condição e sem erro

### US-12606 — Os números do painel continuam honestos

Como dono da loja, quero que o faturamento não conte o acréscimo do parcelamento
como venda de produto, para ler as métricas sem distorção.

#### AC-12621 — O acréscimo não infla o faturamento por forma

- **Dado** pedidos com condição que tem acréscimo
- **Quando** o dono abre as métricas de venda por forma de pagamento
- **Então** o acréscimo aparece separado do valor dos produtos, ou conforme Q-12609
- **E** os pedidos sem condição mantêm os mesmos números de antes

## Suposições

| ID        | Suposição                                                                                                                                                      | Status | Resolução |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-12601 | Nenhuma regra comercial nova está confirmada; os comportamentos propostos e o design.md são para o dono do produto revisar                                     | aberta | —         |
| ASM-12602 | As funções existentes (PIX com chave congelada no pedido, dinheiro com troco, cartão na entrega, mensagem do pedido, cupom, quadro de pedidos) são preservadas | aberta | —         |
| ASM-12603 | A alternativa A não coleta CPF do pagador e não guarda nem transmite linha digitável ou PDF de boleto; a loja envia o boleto fora do sistema                   | aberta | —         |
| ASM-12604 | Valores em centavos inteiros, e a diferença de arredondamento das parcelas vai para a última parcela                                                           | aberta | —         |
| ASM-12605 | A exigência legal de informar preço à vista, parcelas, acréscimos e total a prazo (Código de Defesa do Consumidor, art. 52) precisa de validação jurídica      | aberta | —         |
| ASM-12606 | As telas de condições de pagamento não estão no ZIP do Stitch e precisam de proposta visual própria, com a base do card #104                                   | aberta | —         |
| ASM-12607 | O controle de quantas parcelas já foram recebidas fica fora da alternativa A; o dono confirma o recebimento do pedido como um todo                             | aberta | —         |

## Perguntas em aberto

| ID      | Pergunta                                                                                                                                                             | Status | Resposta |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-12601 | O SimpleClick vai oferecer parcelamento, boleto ou novas condições? Pergunta-mãe: Q-10305, que decide quais funções "A decidir" entram                               | aberta | —        |
| Q-12602 | As condições são só informadas pela loja e pagas fora do sistema (alternativa A) ou haverá cobrança online de verdade (alternativa B)?                               | aberta | —        |
| Q-12603 | Quais condições entram: parcelamento, boleto combinado, desconto à vista ou outras?                                                                                  | aberta | —        |
| Q-12604 | Qual o modelo de acréscimo, o máximo de parcelas, a parcela mínima e o teto do desconto?                                                                             | aberta | —        |
| Q-12605 | Como funciona o boleto na alternativa A: a loja envia fora do sistema, e o sistema pode guardar a linha digitável (o que a tornaria dado sensível)?                  | aberta | —        |
| Q-12606 | Se for online: qual provedor, quais taxas, como conciliar, reembolsar e tratar contestação, e o usuário aceita revogar a decisão AC-513 e mudar o teste de cobrança? | aberta | —        |
| Q-12607 | A vitrine e a página do produto mostram um resumo como "até Nx"?                                                                                                     | aberta | —        |
| Q-12608 | O desconto à vista soma com cupom (#119), fidelidade (#125) e atacado, ou fica só um desconto por pedido?                                                            | aberta | —        |
| Q-12609 | Nas métricas, o acréscimo do parcelamento fica fora do faturamento, aparece à parte ou entra no total?                                                               | aberta | —        |
| Q-12610 | O pedido de balcão pode registrar parcelamento e boleto?                                                                                                             | aberta | —        |
| Q-12611 | O dono precisa controlar parcelas recebidas (pagamento parcial), o que exigiria novos status de pagamento?                                                           | aberta | —        |
