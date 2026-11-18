# Spec: Cupons promocionais e carteira de cupons (A decidir)

> feature: decidir-cupons
> status: rascunho

<!--
  Card #119 do RM Board. Bloco de códigos: 11901 a 11999.
  PROPOSTA NÃO APROVADA (P-107): nenhuma regra comercial está confirmada e
  nada aqui autoriza implementação. Os critérios descrevem o comportamento
  PROPOSTO para o dono do produto revisar. Dados do Stitch (PRIMEIRACOMPRA,
  valores, textos) são só ilustração (P-105).
  "Cupom" já existe no sistema com outro sentido: o comprovante impresso do
  pedido (modules/printing, core/cupom-*.ts). Esta função usa o nome
  "cupom promocional" para não se confundir com ele.
-->

## Contexto

Hoje o SimpleClick não tem cupom de desconto: o pedido tem colunas
reservadas (`coupon_discount_cents`, `coupon_id`, `coupon_code_snapshot`) que
nenhum código usa, e o total é só itens mais taxa de entrega. O Stitch mostra
um campo "Cupom de desconto", a linha "Desconto Cupom" no resumo e o item
"Carteira & Cupons" no rodapé. Esta spec propõe como a loja criaria cupons, o
cliente os aplicaria na sacola com o desconto conferido pelo servidor, e como
uma carteira apenas de cupons (sem saldo em dinheiro) os listaria. As funções
existentes (atacado, preço promocional, impresso, idempotência do pedido) são
preservadas.

## Histórias

### US-11901 — Cliente aplica um cupom e confere o desconto antes de fechar

Como cliente logado, quero aplicar um cupom válido à minha sacola e ver o
desconto no total antes de fechar, para saber exatamente quanto vou pagar.

#### AC-11901 — Cupom válido gera o desconto correto no total

- **Dado** um cupom ativo, dentro da validade, da loja da sacola e com o pedido mínimo atingido
- **Quando** o cliente aplica o cupom no fechamento
- **Então** o resumo mostra a linha de desconto e o total já descontado
- **E** o valor é calculado pelo servidor sobre o subtotal dos itens, sem usar nenhum valor enviado pela tela

#### AC-11902 — Cupom inválido não dá desconto e não revela de quem é

- **Dado** um cupom expirado, abaixo do pedido mínimo, de outra loja ou inexistente
- **Quando** o cliente tenta aplicá-lo
- **Então** a tela avisa que o cupom não pode ser usado e o total não muda
- **E** cupom de outra loja e cupom inexistente recebem a mesma resposta (`cupom_invalido`), para não revelar que o código existe noutra loja

#### AC-11903 — Cupom que mudou antes de fechar impede o pedido

- **Dado** um cupom aplicado na tela que deixou de valer (desativado, expirado ou esgotado) ou cujo desconto visto pela tela difere do calculado
- **Quando** o cliente confirma o pedido
- **Então** o pedido não é criado e a tela explica o motivo (409 com `cupom_invalido` ou `desconto_divergente`)
- **E** nenhum pedido sai com desconto indevido

#### AC-11904 — O desconto respeita os limites do valor

- **Dado** um cupom de qualquer tipo e um subtotal qualquer
- **Quando** o desconto é calculado
- **Então** ele é um número inteiro de centavos, menor ou igual ao subtotal, nunca incide sobre a taxa de entrega e o total nunca fica negativo
- **E** o troco e o PIX exibidos na tela usam o total já com desconto

#### AC-11905 — Aplicar cupom exige conta e tem limite de tentativas

- **Dado** um visitante sem login, ou um cliente que erra códigos repetidamente
- **Quando** tenta validar um cupom
- **Então** o visitante é pedido para entrar, e a conferência anônima do carrinho ignora o cupom
- **E** o excesso de tentativas por IP, conta e loja recebe 429 com espera

### US-11902 — Dono cria e administra os cupons da sua loja

Como dono de loja, quero criar, editar e desativar cupons com regras claras,
para fazer promoções sem comprometer minha margem.

#### AC-11906 — Cupom é criado só com regras válidas

- **Dado** o dono da loja no painel de cupons
- **Quando** cria um cupom
- **Então** o cupom só é aceito com código no formato `^[A-Z0-9_-]{4,32}$` (único na loja, sem diferenciar maiúsculas), percentual de 1 a 100 ou valor maior que zero, início anterior ao fim e limites de uso maiores ou iguais a 1
- **E** a tela mostra o motivo de cada recusa

#### AC-11907 — Equipe não altera cupons

- **Dado** um membro da equipe sem permissão de dono
- **Quando** tenta criar, editar ou desativar um cupom
- **Então** a tela avisa que ele não tem acesso (403)

#### AC-11908 — Uma loja não vê nem altera cupom de outra

- **Dado** cupons de duas lojas diferentes
- **Quando** o dono de uma loja lista, lê ou altera cupons
- **Então** só enxerga e altera os da própria loja

#### AC-11909 — Desativar não mexe no passado

- **Dado** um cupom já usado em pedidos
- **Quando** o dono o desativa
- **Então** novos pedidos não o aceitam e os pedidos antigos mantêm código e valor de desconto
- **E** o cupom nunca é apagado de verdade (só desativado)

#### AC-11910 — Toda alteração de cupom deixa registro

- **Dado** um cupom criado, editado ou desativado
- **Quando** a alteração é concluída
- **Então** existe registro de auditoria com quem fez, o que mudou, antes e depois, sem e-mail nem telefone

### US-11903 — Limites de uso são respeitados mesmo com compras simultâneas

Como dono de loja, quero que o limite de usos e o limite por cliente nunca
sejam ultrapassados, para controlar o custo da promoção.

#### AC-11911 — Limite total vale com fechamentos simultâneos

- **Dado** um cupom com um único uso restante e dois clientes fechando pedidos ao mesmo tempo
- **Quando** os dois confirmam
- **Então** apenas um pedido recebe o desconto e o outro é avisado de que o cupom esgotou
- **E** o total de usos nunca passa do limite

#### AC-11912 — Limite por cliente vale e exige cliente identificado

- **Dado** um cupom com limite por cliente
- **Quando** o mesmo cliente tenta usar além do limite, ou o pedido não tem cliente da loja vinculado
- **Então** o cupom é recusado nos dois casos

#### AC-11913 — Reenviar o pedido não gasta outro uso

- **Dado** um pedido com cupom enviado duas vezes com a mesma chave de idempotência
- **Quando** o segundo envio chega
- **Então** devolve o mesmo pedido, com o mesmo desconto e a mesma mensagem, e o uso é consumido uma só vez

### US-11904 — O pedido mostra o cupom aplicado

Como cliente e como dono, quero ver qual cupom e quanto de desconto entraram
no pedido, para conferir e explicar o valor cobrado.

#### AC-11914 — Painel da loja mostra o cupom do pedido

- **Dado** um pedido com cupom
- **Quando** o dono abre o pedido no painel
- **Então** vê o código e o valor do desconto, separados do desconto de atacado e do frete

#### AC-11915 — Cliente vê o cupom no pedido da sua conta

- **Dado** um pedido com cupom
- **Quando** o cliente abre o pedido em sua conta
- **Então** vê o código e o desconto no resumo de valores

#### AC-11916 — Mensagem do WhatsApp traz o desconto, inclusive no reenvio

- **Dado** um pedido com cupom
- **Quando** a mensagem do WhatsApp é montada, na resposta normal e no reenvio idempotente
- **Então** as duas trazem a linha de desconto e o total iguais

#### AC-11917 — Comprovante impresso traz o desconto nos dois caminhos

- **Dado** um pedido com cupom
- **Quando** o comprovante é impresso pelo painel e pelo agente de impressão
- **Então** os dois mostram a linha de desconto do cupom com o mesmo valor

### US-11905 — Cliente consulta a carteira de cupons

Como cliente, quero uma carteira com os cupons que posso usar, para não
perder promoções, sem que isso seja um saldo em dinheiro.

#### AC-11918 — Carteira lista cupons sem saldo

- **Dado** um cliente com cupons recebidos de lojas
- **Quando** abre a carteira em sua conta
- **Então** vê cada cupom com a loja, a regra e a validade
- **E** não existe valor em dinheiro guardado nem sacável

#### AC-11919 — Cupom vencido aparece como vencido e não se aplica

- **Dado** um cupom da carteira cuja validade passou
- **Quando** o cliente o vê e tenta usá-lo
- **Então** aparece marcado como vencido e a aplicação é recusada

#### AC-11920 — Cupom privado só vale para quem o recebeu

- **Dado** um cupom privado concedido a um cliente
- **Quando** outro cliente tenta aplicar o código ou abrir a carteira alheia
- **Então** a aplicação responde como cupom inexistente e a carteira alheia responde 404

## Fora de escopo

- Implementar código, criar testes, alterar banco, API ou dependências.
- Saldo em dinheiro, cashback, crédito financeiro ou resgate em dinheiro.
- Cupom emitido ou financiado pela plataforma (depende de Q-11902).
- Envio em massa de cupons por e-mail, SMS ou WhatsApp.
- Pedido manual do painel com cupom (depende de Q-11910).
- Pontos e carimbos: pertencem à fidelidade (#125).
- Mudar o comprovante impresso existente além da linha de desconto.

## Suposições

| ID        | Suposição                                                                                                                                           | Status | Resolução |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-11901 | O cupom pertence a uma loja e só vale nela                                                                                                          | aberta | —         |
| ASM-11902 | Cada pedido aceita no máximo um cupom                                                                                                               | aberta | —         |
| ASM-11903 | O desconto incide sobre o subtotal já com atacado e preço promocional, na ordem fixada em 0008_pedidos.sql: subtotal, cupom, frete, retirada, total | aberta | —         |
| ASM-11904 | Cupom percentual arredonda o desconto para baixo, em centavos inteiros, como o atacado (`unitarioNaFaixa`)                                          | aberta | —         |
| ASM-11905 | Aplicar cupom exige conta logada, como o pedido já exige                                                                                            | aberta | —         |
| ASM-11906 | O uso é consumido na mesma transação do pedido, com trava na linha do cupom, depois de criar o pedido e antes de reservar o estoque                 | aberta | —         |
| ASM-11907 | A carteira lista cupons e não guarda dinheiro                                                                                                       | aberta | —         |
| ASM-11908 | Impresso, atacado, preço promocional e idempotência do pedido continuam como hoje                                                                   | aberta | —         |
| ASM-11909 | Código e valor do desconto ficam como cópia no pedido, nas colunas já existentes (`coupon_code_snapshot`, `coupon_discount_cents`)                  | aberta | —         |
| ASM-11910 | Esta spec é de planejamento e não tem teste automatizado; a prova é a revisão do dono do produto mais a auditoria sem erro de estrutura             | aberta | —         |
| ASM-11911 | Repetir um pedido anterior não copia o cupom                                                                                                        | aberta | —         |
| ASM-11912 | A coluna `discount_cents` do pedido fica para desconto manual ou genérico; o total é subtotal menos cupom mais taxa menos retirada menos desconto   | aberta | —         |

## Perguntas em aberto

| ID      | Pergunta                                                                                                                                             | Status | Resposta |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-11901 | Fazer ou não os cupons promocionais e a carteira?                                                                                                    | aberta | —        |
| Q-11902 | Quem emite e financia: só a loja, ou a plataforma também?                                                                                            | aberta | —        |
| Q-11903 | O desconto é em valor fixo, percentual ou também frete grátis? Frete grátis muda a regra de incidir só sobre o subtotal                              | aberta | —        |
| Q-11904 | Cupom acumula com preço de atacado, preço promocional e fidelidade (#125)? Em que ordem?                                                             | aberta | —        |
| Q-11905 | Existe cupom de primeira compra? Como se define "primeira compra"?                                                                                   | aberta | —        |
| Q-11906 | Cancelar ou recusar o pedido devolve o uso do cupom?                                                                                                 | aberta | —        |
| Q-11907 | O pedido mínimo e o frete grátis consideram o subtotal antes ou depois do cupom?                                                                     | aberta | —        |
| Q-11908 | Como o cupom chega à carteira: código digitado, envio da loja, ou os dois?                                                                           | aberta | —        |
| Q-11909 | Além do limite de usos, a loja define orçamento total em R$ para o cupom?                                                                            | aberta | —        |
| Q-11910 | O pedido manual do painel aceita cupom?                                                                                                              | aberta | —        |
| Q-11911 | A equipe pode ter permissão própria de cupons ou só o dono administra?                                                                               | aberta | —        |
| Q-11912 | A prova de concorrência e de isolamento exige banco: o `verify` passa a rodar também os testes de integração da API? (decisão do gerente ou usuário) | aberta | —        |
| Q-11913 | O limite por cliente conta por cliente da loja ou por conta? Como tratar várias contas da mesma pessoa?                                              | aberta | —        |
| Q-11914 | Onde o código do cupom fica entre aplicar e fechar: no carrinho do servidor ou no navegador?                                                         | aberta | —        |
