# Spec: Carrinho e Fechamento do Pedido

> feature: pedido-checkout
> status: rascunho

## Contexto

É o momento em que a navegação vira dinheiro. O cliente monta o carrinho na
vitrine, informa como quer receber, vê a chave PIX que o dono cadastrou, e o
pedido é ao mesmo tempo **registrado no sistema** (para contar nas métricas e no
histórico) e **formatado em texto e enviado pelo WhatsApp** (para o dono
confirmar do jeito que ele já trabalha hoje). Não existe cobrança automática na
versão 1: o pagamento é combinado entre as duas pessoas, e o sistema só organiza.

## Histórias

### US-500 — Cliente monta o carrinho e revisa antes de fechar

Como cliente final, quero juntar itens e revisar o que pedi, para que eu não
erre o pedido nem o valor.

#### AC-500 — Item adicionado aparece no carrinho com o que foi escolhido

- **Dado** que escolhi um produto com opções e quantidade na página do produto
- **Quando** adiciono ao carrinho
- **Então** o carrinho passa a mostrar o item com nome, opções escolhidas, observação, quantidade e valor, e o contador do carrinho reflete a quantidade total de itens

#### AC-501 — Carrinho permite mudar quantidade e remover item

- **Dado** um carrinho com três itens
- **Quando** aumento a quantidade de um, diminuo de outro até zero e removo o terceiro
- **Então** o item que chegou a zero sai do carrinho, o total é recalculado a cada mudança, e o carrinho vazio mostra mensagem convidando a voltar à vitrine

#### AC-502 — Carrinho sobrevive ao recarregar a página

- **Dado** um carrinho com itens montado
- **Quando** recarrego a página ou volto à loja depois de fechar o navegador
- **Então** meus itens continuam lá, vinculados àquela loja, e o carrinho de uma loja nunca se mistura com o de outra

#### AC-503 — Mudança de preço ou de disponibilidade é avisada antes de fechar

- **Dado** um carrinho montado em que o dono mudou o preço de um item ou o esgotou depois
- **Quando** vou fechar o pedido
- **Então** a tela avisa exatamente o que mudou, mostra o valor atualizado, e só prossegue depois que eu confirmar as mudanças

#### AC-504 — Total é sempre o que o servidor calcula

- **Dado** um carrinho pronto para fechar
- **Quando** o pedido é enviado com valores manipulados pelo cliente
- **Então** o pedido é criado com os valores calculados pelo servidor a partir do catálogo, e a divergência fica registrada no log de segurança

### US-501 — Cliente informa como quer receber e pagar

Como cliente final, quero dizer se busco ou recebo em casa e como vou pagar, para
que o dono prepare meu pedido do jeito certo.

#### AC-505 — Cliente escolhe entrega ou retirada conforme a loja permite

- **Dado** uma loja que oferece entrega e retirada
- **Quando** estou no fechamento do pedido
- **Então** escolho entre receber em casa ou retirar no local; ao escolher entrega, os campos de endereço passam a ser obrigatórios; ao escolher retirada, o endereço não é pedido e o endereço da loja é exibido

#### AC-506 — Loja que só faz retirada não oferece entrega

- **Dado** uma loja configurada apenas para retirada
- **Quando** abro o fechamento do pedido
- **Então** a opção de entrega não aparece, e a taxa de entrega não é somada em nenhum caso

#### AC-507 — Taxa de entrega cadastrada é somada e explicada

- **Dado** uma loja com taxa de entrega cadastrada e escolha de entrega
- **Quando** vejo o resumo do pedido
- **Então** vejo o valor dos itens, a taxa de entrega em linha separada e o total final, e a taxa aparece com o nome que o dono deu a ela

#### AC-508 — Dados obrigatórios do cliente são validados antes de enviar

- **Dado** que estou fechando o pedido
- **Quando** deixo nome ou telefone em branco, ou informo telefone em formato impossível
- **Então** a tela aponta cada campo pendente com explicação, mantém o que já preenchi, e o pedido não é criado

#### AC-509 — Cliente logado tem os dados já preenchidos

- **Dado** que estou logado e já pedi nesta loja antes
- **Quando** abro o fechamento do pedido
- **Então** meu nome, telefone e último endereço vêm preenchidos e editáveis, sem que eu digite tudo de novo

### US-502 — Cliente vê a chave PIX da loja para pagar

Como cliente final, quero ver a chave PIX da loja e copiá-la, para que eu pague
sem precisar perguntar.

#### AC-510 — Chave PIX cadastrada é exibida e copiável

- **Dado** uma loja que cadastrou chave PIX e aceita PIX como forma de pagamento
- **Quando** escolho pagar com PIX no fechamento
- **Então** vejo a chave PIX da loja com o nome do recebedor, um botão que copia a chave, e a confirmação visual de que foi copiada

#### AC-511 — Pedido guarda a chave PIX que valia no momento

- **Dado** um pedido pago por PIX
- **Quando** o dono muda a chave PIX da loja depois
- **Então** o pedido antigo continua mostrando a chave que estava valendo quando foi feito, porque o pedido é registro do momento da compra

#### AC-512 — Outras formas de pagamento combinadas aparecem como opção

- **Dado** uma loja que aceita PIX, dinheiro e cartão na entrega
- **Quando** estou no fechamento
- **Então** vejo as três opções conforme o dono configurou, escolho uma, e ao escolher dinheiro posso informar para quanto preciso de troco

#### AC-513 — Nenhuma etapa cobra de verdade nem pede dado de cartão

- **Dado** qualquer fluxo de fechamento de pedido na versão 1
- **Quando** percorro todas as telas até o fim
- **Então** em nenhum momento é pedido número de cartão, e nenhuma cobrança automática acontece: o pagamento é combinado entre cliente e loja fora do sistema

### US-503 — Pedido é registrado no sistema ao ser enviado

Como dono de loja, quero que todo pedido fique registrado, para que meu histórico
e minhas métricas sejam verdade.

#### AC-514 — Pedido confirmado recebe número e entra na fila da loja

- **Dado** um carrinho válido em loja aberta
- **Quando** confirmo o envio do pedido
- **Então** o pedido é criado com número sequencial por loja, status inicial de aguardando confirmação, e aparece na fila de pedidos do dono em poucos segundos

#### AC-515 — Pedido guarda cópia congelada dos itens e preços

- **Dado** um pedido já criado
- **Quando** o dono depois altera o nome, o preço ou as opções daquele produto no catálogo
- **Então** o pedido continua mostrando exatamente o nome, o preço e as opções do momento da compra, sem nenhuma alteração

#### AC-516 — Enviar duas vezes não cria dois pedidos

- **Dado** que confirmei o pedido e a resposta demorou
- **Quando** o envio é repetido, por toque duplo ou por nova tentativa automática
- **Então** apenas um pedido é criado, e a segunda tentativa recebe de volta o mesmo pedido em vez de gerar duplicata

#### AC-517 — Loja fechada não aceita pedido novo

- **Dado** uma loja fora do horário de funcionamento
- **Quando** tento confirmar o pedido
- **Então** o pedido não é criado, a tela informa o horário em que a loja abre, e meu carrinho é preservado para eu tentar depois

#### AC-518 — Pedido de convidado é registrado sem exigir conta

- **Dado** que não estou logado e não quero criar conta
- **Quando** informo nome e telefone e confirmo o pedido
- **Então** o pedido é criado normalmente e recebo o link de acompanhamento, e a tela me oferece criar conta depois para guardar o histórico

### US-504 — Pedido chega ao WhatsApp formatado e legível

Como dono de loja, quero receber o pedido em texto pronto no WhatsApp, para que
eu confirme com o cliente do jeito que já trabalho hoje.

#### AC-519 — Texto do pedido é completo e legível no WhatsApp

- **Dado** um pedido confirmado com vários itens, opções, observação e taxa de entrega
- **Quando** o texto do pedido é gerado
- **Então** ele traz número do pedido, nome e telefone do cliente, cada item com quantidade, opções e valor, observações, forma de entrega com endereço quando houver, forma de pagamento, total, e o link de acompanhamento — formatado com quebras de linha e destaque que o WhatsApp entende

#### AC-520 — Enviar pelo WhatsApp abre a conversa com o texto pronto

- **Dado** um pedido recém-confirmado
- **Quando** escolho enviar pelo WhatsApp
- **Então** a conversa com o número da loja abre com o texto do pedido já preenchido, pronto para eu apenas enviar, funcionando tanto no celular quanto no computador

#### AC-521 — Texto longo não é cortado no meio

- **Dado** um pedido com muitos itens, cujo texto passa do limite que cabe em um link
- **Quando** o envio é preparado
- **Então** o cliente recebe o pedido completo sem truncar — o texto é encurtado de forma controlada com o essencial e o link de acompanhamento leva ao detalhe completo

#### AC-522 — Caracteres especiais e emoji não quebram a mensagem

- **Dado** um pedido com acentos, emoji e observação com quebras de linha
- **Quando** a mensagem é gerada
- **Então** o texto chega íntegro no WhatsApp, sem caractere estranho no lugar de acento e sem perder as quebras de linha

#### AC-523 — Falha no WhatsApp não perde o pedido

- **Dado** um pedido criado com sucesso
- **Quando** o envio pelo WhatsApp falha ou o cliente fecha a janela antes de enviar
- **Então** o pedido continua registrado no sistema e visível na fila do dono, e existe caminho para reenviar a mensagem depois

## Fora de escopo

- Cobrança automática por PIX com QR Code dinâmico, conciliação e confirmação
  de pagamento: a versão 1 apenas exibe a chave cadastrada — ver Q-500.
- Integração com a API oficial do WhatsApp para envio automático sem ação
  humana: a versão 1 usa link que abre a conversa com o texto pronto.
- Cálculo de taxa de entrega por distância ou por bairro com mapa.
- Cupom de desconto aplicado no carrinho — ver Q-302 na feature de catálogo.
- Agendamento de pedido para data e hora futuras — ver Q-502.
- Gorjeta ou taxa de serviço.

## Suposições

| ID      | Suposição                                                                                                                                                    | Status | Resolução |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| ASM-500 | O pedido é registrado no sistema primeiro e só depois o texto do WhatsApp é oferecido, para que o pedido exista mesmo se a mensagem não for enviada          | aberta | —         |
| ASM-501 | O link que abre a conversa do WhatsApp com o texto pronto atende a versão 1 gratuita, porque a API oficial cobra por conversa e exige verificação de negócio | aberta | —         |
| ASM-502 | A mensagem sai do cliente para a loja, então o telefone de WhatsApp da loja é obrigatório no cadastro e o do cliente serve para o dono responder             | aberta | —         |
| ASM-503 | A chave PIX é apenas texto exibido, sem validação de formato junto ao banco, e o dono é responsável por cadastrá-la corretamente                             | aberta | —         |
| ASM-504 | A taxa de entrega é valor fixo por loja na versão 1, sem cálculo por distância                                                                               | aberta | —         |
| ASM-505 | O carrinho vive no navegador do cliente, e só se torna pedido no servidor no momento da confirmação                                                          | aberta | —         |

## Perguntas em aberto

| ID    | Pergunta                                                                                                                                                                                            | Status     | Resposta                                                                                                                                                                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-500 | O PIX deve evoluir para QR Code gerado pelo sistema (código copia e cola padrão do Banco Central), ainda sem confirmação automática de pagamento? Isso reduz erro de digitação sem custo de gateway | aberta     | —                                                                                                                                                                                                                                                    |
| Q-501 | Quem envia a mensagem no WhatsApp: o cliente manda o pedido para a loja, a loja manda a confirmação para o cliente, ou os dois sentidos?                                                            | respondida | O cliente manda para a loja: ao fechar o pedido, abre o WhatsApp do cliente com o texto pronto endereçado ao número da loja (decisão de 17/08/2026). O acompanhamento do cliente acontece pela página de acompanhamento, não por mensagem automática |
| Q-502 | O cliente pode agendar o pedido para mais tarde ou para outro dia, ou todo pedido é para agora?                                                                                                     | aberta     | —                                                                                                                                                                                                                                                    |
| Q-503 | Existe valor mínimo de pedido, e ele muda entre entrega e retirada?                                                                                                                                 | aberta     | —                                                                                                                                                                                                                                                    |
| Q-504 | O dono precisa aprovar o pedido antes de ele entrar na produção, ou pedido confirmado já vai direto para a impressora?                                                                              | aberta     | —                                                                                                                                                                                                                                                    |
