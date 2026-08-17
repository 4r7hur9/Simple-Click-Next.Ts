# Spec: Clientes da Loja

> feature: clientes-loja
> status: rascunho

## Contexto

Boa parte do movimento de um pequeno negócio não passa pelo site: chega pelo
telefone, pelo WhatsApp ou no balcão. Se esses pedidos ficarem fora do sistema,
o painel de métricas mente. Esta feature dá ao dono da loja a lista dos próprios
clientes, o cadastro manual e — o ponto mais importante — a capacidade de lançar
um pedido no lugar do cliente, para que o histórico e os números reflitam o
negócio inteiro, não só a parte digital.

## Histórias

### US-700 — Dono vê a lista de clientes da própria loja

Como dono de loja, quero ver quem já comprou comigo, para que eu conheça meus
clientes e saiba quem some.

#### AC-700 — Lista mostra clientes com o que importa para atender

- **Dado** que sou dono de loja com clientes que já compraram
- **Quando** abro a área de clientes
- **Então** vejo nome, telefone, total de pedidos, valor total gasto e data do último pedido, com os estados de carregando, vazio e erro tratados

#### AC-701 — Busca encontra cliente por nome e por telefone

- **Dado** uma lista com muitos clientes
- **Quando** busco por parte do nome ou por parte do telefone
- **Então** vejo apenas os clientes correspondentes, e a busca funciona mesmo quando o telefone foi digitado com pontuação diferente da que usei

#### AC-702 — Cliente de outra loja nunca aparece

- **Dado** que sou dono da loja A e existe cliente que só comprou na loja B
- **Quando** listo ou busco clientes, inclusive informando o identificador direto daquele cliente
- **Então** ele não aparece e o acesso é negado, porque cada loja só alcança quem comprou nela

### US-701 — Dono cadastra e mantém o cadastro de um cliente

Como dono de loja, quero cadastrar o cliente que me liga, para que eu não peça
os mesmos dados a cada pedido.

#### AC-703 — Cadastro manual cria o cliente com o mínimo necessário

- **Dado** que estou na área de clientes
- **Quando** cadastro nome e telefone, e opcionalmente e-mail, endereço e observação
- **Então** o cliente é criado vinculado à minha loja e já pode receber pedido manual, mesmo sem conta de acesso na plataforma

#### AC-704 — Telefone repetido na mesma loja é apontado

- **Dado** que já tenho cliente cadastrado com o telefone informado
- **Quando** tento cadastrar outro cliente com o mesmo telefone
- **Então** o sistema avisa que já existe cliente com aquele telefone e me oferece abrir o cadastro existente em vez de duplicar

#### AC-705 — Edição e remoção do cadastro funcionam sem afetar pedidos

- **Dado** um cliente com pedidos registrados
- **Quando** corrijo os dados dele ou removo o cadastro
- **Então** a correção aparece na lista, a remoção tira o cliente das listagens, e os pedidos já feitos continuam íntegros com os dados que tinham no momento da compra

#### AC-706 — Cliente com conta na plataforma é reconhecido, não duplicado

- **Dado** um cliente que já tem conta própria na plataforma e comprou na minha loja
- **Quando** tento cadastrá-lo manualmente com o mesmo telefone ou e-mail
- **Então** o sistema aponta o vínculo existente e mantém um único cadastro dele na minha loja, sem criar registro paralelo

### US-702 — Dono lança pedido no lugar do cliente

Como dono de loja, quero registrar o pedido que recebi por telefone, para que ele
entre na produção, saia na impressora e conte nas minhas métricas igual a um
pedido do site.

#### AC-707 — Pedido manual é criado como qualquer outro pedido

- **Dado** que estou na ficha de um cliente
- **Quando** monto o pedido escolhendo produtos, quantidades e opções, e confirmo
- **Então** o pedido é criado com marcação de canal manual, aparece na fila de pedidos da loja com um número próprio, e o total é calculado pelo servidor com os preços atuais

#### AC-708 — Pedido manual respeita as regras do catálogo

- **Dado** que estou montando um pedido manual
- **Quando** escolho um produto que tem grupo de escolha obrigatória e não escolho nenhuma opção
- **Então** o sistema impede a confirmação apontando o grupo pendente, exatamente como acontece com o cliente na vitrine

#### AC-709 — Pedido manual pode ser lançado para cliente sem cadastro

- **Dado** que atendo alguém que não quer se cadastrar
- **Quando** lanço o pedido informando apenas nome e telefone no próprio pedido
- **Então** o pedido é criado normalmente, entra nas métricas, e o sistema não me obriga a criar cadastro de cliente

#### AC-710 — Pedido manual também sai na impressora e conta na métrica

- **Dado** um pedido manual confirmado em loja com impressão configurada
- **Quando** o pedido é criado
- **Então** o cupom é enviado à impressora do mesmo jeito que um pedido do site, e o pedido aparece nas métricas do dia com o canal identificado como manual

### US-703 — Dono vê o histórico de um cliente

Como dono de loja, quero abrir o histórico de compras de um cliente, para que eu
atenda melhor e repita um pedido antigo com facilidade.

#### AC-711 — Ficha do cliente mostra o histórico completo

- **Dado** um cliente com vários pedidos na minha loja
- **Quando** abro a ficha dele
- **Então** vejo os pedidos em ordem da data mais recente para a mais antiga, com número, data, itens, valor e status de cada um

#### AC-712 — Repetir um pedido anterior monta o novo pedido pronto

- **Dado** um pedido antigo na ficha do cliente
- **Quando** escolho repetir aquele pedido
- **Então** um pedido novo é montado com os mesmos itens e opções, os preços são recalculados pelos valores atuais, e os itens que saíram do catálogo são apontados para eu decidir o que fazer

#### AC-713 — Ficha alerta quando algo do pedido antigo não existe mais

- **Dado** um pedido antigo que incluía um produto já removido do catálogo
- **Quando** abro esse pedido no histórico
- **Então** os itens aparecem com o nome e o preço que tinham na época, marcados como não mais disponíveis, sem quebrar a tela

## Fora de escopo

- Campanha de mensagem em massa para a base de clientes (disparo de promoção).
- Segmentação avançada e etiquetas de cliente para marketing.
- Programa de fidelidade e pontuação por cliente — ver Q-302 na feature de
  catálogo.
- Importação de lista de clientes de planilha ou de outro sistema.
- Cadastro de endereço com cálculo de taxa de entrega por distância.
- Visão do administrador geral sobre os clientes finais de cada loja.

## Suposições

| ID      | Suposição                                                                                                                                                         | Status | Resolução |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-700 | O telefone é o identificador prático do cliente para o pequeno negócio, então ele é obrigatório no cadastro manual e o e-mail é opcional                          | aberta | —         |
| ASM-701 | O vínculo do cliente é por loja: quem tem conta na plataforma e compra em três lojas aparece como cliente nas três, sem que uma veja o histórico da outra         | aberta | —         |
| ASM-702 | O dono lança pedido manual pelo celular durante o atendimento, então a tela precisa ser rápida no toque e funcionar com uma mão                                   | aberta | —         |
| ASM-703 | Remover cliente é ocultação com retenção, não apagamento imediato, para preservar a integridade das métricas e atender pedido de exclusão da LGPD dentro do prazo | aberta | —         |
| ASM-704 | O dono da loja é o controlador dos dados dos próprios clientes e a plataforma é operadora, o que exige registro de consentimento e finalidade no cadastro manual  | aberta | —         |

## Perguntas em aberto

| ID    | Pergunta                                                                                                                                                                       | Status | Resposta |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | -------- |
| Q-700 | O cliente final pode pedir a exclusão dos dados dele diretamente na plataforma, ou o pedido passa pelo dono da loja? A LGPD dá esse direito e a versão 1 precisa de um caminho | aberta | —        |
| Q-701 | O dono pode editar ou cancelar um pedido depois de criado, e até qual status isso é permitido?                                                                                 | aberta | —        |
| Q-702 | Quando o dono lança pedido manual, o cliente deve receber a confirmação por WhatsApp automaticamente ou só quando o dono pedir?                                                | aberta | —        |
| Q-703 | O dono precisa registrar pagamento recebido no pedido manual (por exemplo dinheiro, PIX pago, a prazo), já que não há gateway na versão 1?                                     | aberta | —        |
