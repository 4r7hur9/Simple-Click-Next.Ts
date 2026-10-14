# Spec: Operação do Pedido

> feature: pedido-operacao
> status: rascunho

## Contexto

Depois que o pedido entra, começa o trabalho de verdade: o dono precisa ver o
pedido chegar sem ficar apertando atualizar, o cupom precisa sair na impressora
para a produção preparar, o status precisa andar, e o cliente precisa acompanhar
sem ligar para a loja. Esta feature cobre a fila de pedidos do dono, a máquina de
status, a página pública de acompanhamento e a impressão térmica — que sai por
clique no navegador por padrão e vira automática para quem ativar o agente de
impressão.

## Histórias

### US-600 — Dono vê o pedido chegar sem procurar

Como dono de loja, quero que o pedido novo apareça na minha tela e chame minha
atenção, para que eu não perca venda por demora.

#### AC-600 — Pedido novo aparece na fila sem recarregar a página

- **Dado** que estou com a fila de pedidos aberta no computador da loja
- **Quando** um cliente confirma um pedido na vitrine
- **Então** o pedido aparece na fila em poucos segundos sem eu recarregar nada, com aviso sonoro e o contador de pedidos aguardando atualizado

#### AC-601 — Fila separa o que exige ação do que já está em andamento

- **Dado** uma fila com pedidos em vários status
- **Quando** abro a fila
- **Então** vejo os que aguardam minha confirmação em destaque no topo, os em preparo e os em entrega agrupados por status, e cada pedido mostra número, horário, cliente, valor, canal e quanto tempo está esperando

#### AC-602 — Conexão instável não faz perder pedido

- **Dado** que a internet da loja caiu por alguns minutos com a fila aberta
- **Quando** a conexão volta
- **Então** a fila se recupera sozinha e mostra os pedidos que entraram durante a queda, com aviso de que houve reconexão, sem que eu precise recarregar

#### AC-603 — Aviso sonoro pode ser silenciado sem perder o alerta visual

- **Dado** que estou em um ambiente onde o som incomoda
- **Quando** silencio o aviso sonoro
- **Então** o pedido novo continua chamando atenção visualmente e a escolha de silenciar permanece quando eu voltar depois

### US-601 — Dono faz o pedido andar pelos status

Como dono de loja, quero mudar o status do pedido conforme trabalho nele, para
que minha equipe e meu cliente saibam onde ele está.

#### AC-604 — Fluxo normal do pedido é aceitar, preparar, entregar e concluir

- **Dado** um pedido aguardando confirmação
- **Quando** eu o aceito, marco como em preparo, marco como saiu para entrega e concluo
- **Então** cada mudança é registrada com horário e quem fez, o cliente vê a mudança na página de acompanhamento, e o pedido chega a concluído

#### AC-605 — Pedido de retirada não passa por status de entrega

- **Dado** um pedido marcado como retirada no local
- **Quando** eu o coloco em preparo
- **Então** o próximo status oferecido é pronto para retirada, e a opção de saiu para entrega não aparece para esse pedido

#### AC-606 — Status inválido é recusado

- **Dado** um pedido já concluído
- **Quando** uma tentativa é feita de voltá-lo para em preparo
- **Então** a mudança é recusada com explicação de que aquele caminho não existe, e o status permanece concluído

#### AC-607 — Recusar ou cancelar exige motivo e avisa o cliente

- **Dado** um pedido que não posso atender
- **Quando** eu o recuso ou cancelo informando o motivo
- **Então** o motivo fica registrado no pedido, o cliente vê na página de acompanhamento que foi cancelado e por quê, e o pedido deixa de contar como venda nas métricas

#### AC-608 — Histórico de status do pedido é completo e imutável

- **Dado** um pedido que passou por vários status
- **Quando** abro o detalhe dele
- **Então** vejo a linha de tempo com cada status, o horário exato e quem fez a mudança, e nenhum registro anterior pode ser alterado ou apagado

### US-602 — Dono confirma que o pedido chegou de fato pelo WhatsApp

Como dono de loja, quero distinguir pedido que o cliente realmente me enviou de
pedido que ficou pela metade, para que minha fila e minhas métricas não encham de
pedido fantasma.

#### AC-609 — Pedido sem confirmação no WhatsApp aparece marcado

- **Dado** um pedido criado em que o cliente abriu o WhatsApp mas não enviou a mensagem
- **Quando** vejo a fila
- **Então** o pedido aparece marcado como aguardando confirmação no WhatsApp, visualmente separado dos pedidos confirmados, para eu decidir se cobro o cliente ou descarto

#### AC-610 — Cliente pode sinalizar que já enviou

- **Dado** que enviei a mensagem do pedido pelo WhatsApp
- **Quando** volto à página de acompanhamento e escolho a opção de já enviei
- **Então** o pedido deixa de aparecer como aguardando confirmação na fila do dono, e o horário dessa sinalização fica registrado

#### AC-611 — Pedido fantasma não infla as métricas

- **Dado** um período com pedidos confirmados e pedidos que nunca saíram do aguardando confirmação
- **Quando** vejo as métricas do painel
- **Então** os não confirmados aparecem em separado e não entram no faturamento, e existe indicação de quantos pedidos se perderam nessa etapa

### US-603 — Cliente acompanha o pedido pelo link

Como cliente final, quero acompanhar meu pedido por um link, para que eu saiba
quando sai sem precisar ligar para a loja.

#### AC-612 — Página de acompanhamento mostra o estado atual e o que já passou

- **Dado** que recebi o link de acompanhamento do meu pedido
- **Quando** abro o link
- **Então** vejo o número do pedido, o status atual em linguagem clara, a linha de tempo do que já aconteceu, os itens, o total, a forma de pagamento e o contato da loja

#### AC-613 — Página atualiza o status sem eu recarregar

- **Dado** que estou com a página de acompanhamento aberta
- **Quando** o dono muda o status do meu pedido
- **Então** a página reflete o status novo em poucos segundos sem eu recarregar

#### AC-614 — Link de acompanhamento não pode ser adivinhado

- **Dado** o link de acompanhamento de um pedido
- **Quando** alguém tenta alcançar outro pedido trocando números ou adivinhando o endereço
- **Então** nenhum pedido de outra pessoa é alcançado, porque o endereço usa um código longo e aleatório, e endereços inválidos respondem que o pedido não foi encontrado

#### AC-615 — Página de acompanhamento não expõe dado além do necessário

- **Dado** que qualquer pessoa com o link alcança a página, sem login
- **Quando** a página é carregada
- **Então** ela mostra apenas o necessário para acompanhar o pedido, com o telefone do cliente parcialmente oculto, e nunca dados internos da loja além do contato público

#### AC-616 — Cliente logado alcança o histórico sem depender do link

- **Dado** que sou cliente logado e fiz pedidos nesta loja
- **Quando** abro meus pedidos na minha conta
- **Então** vejo todos os meus pedidos daquela loja com status atual, e consigo abrir o detalhe de cada um sem precisar do link original

### US-604 — Cupom do pedido sai na impressora da loja

Como dono de loja, quero o cupom do pedido impresso na minha impressora térmica,
para que a produção prepare sem eu ditar nada.

#### AC-617 — Cupom sai por um clique, sem instalar nada

- **Dado** um pedido na fila e uma impressora térmica instalada no computador da loja
- **Quando** escolho imprimir o pedido
- **Então** o cupom é impresso no tamanho de papel configurado, com o conteúdo do pedido legível, sem depender de nenhum programa instalado além do navegador

#### AC-618 — Cupom respeita a largura de papel escolhida

- **Dado** uma loja com papel de 58 mm e outra com 80 mm
- **Quando** cada uma imprime o mesmo pedido
- **Então** o cupom sai ajustado à largura configurada, sem texto cortado na lateral e com os valores alinhados à direita em coluna

#### AC-619 — Cupom traz o que a produção precisa, na ordem certa

- **Dado** um pedido com vários itens, opções escolhidas, observações e entrega
- **Quando** o cupom é gerado
- **Então** ele traz nome da loja, número do pedido, data e hora, canal, cliente e telefone, cada item com quantidade e opções, as observações destacadas, o endereço de entrega quando houver, a forma de pagamento e o total

#### AC-620 — Acento não sai corrompido no papel

- **Dado** um pedido com palavras acentuadas e cedilha, como "Açaí com granola" e "Guaraná"
- **Quando** o cupom é impresso
- **Então** os acentos e a cedilha aparecem corretos no papel, sem símbolo estranho no lugar

#### AC-621 — Reimprimir deixa claro que é segunda via

- **Dado** um pedido cujo cupom já foi impresso e o papel foi perdido
- **Quando** peço para imprimir de novo
- **Então** um cupom novo é gerado marcado visivelmente como reimpressão com o número da via, e o pedido registra quantas vezes foi impresso

### US-605 — Loja que quer automatizar liga o agente de impressão

Como dono de loja com movimento alto, quero que o cupom saia sozinho quando o
pedido entra, para que ninguém precise clicar em nada durante o corre.

#### AC-622 — Impressão automática vem desligada e é ligada por escolha

- **Dado** uma loja recém-configurada
- **Quando** abro as configurações de impressão
- **Então** a impressão automática está desligada e a impressão por clique é o padrão em vigor, e existe uma chave para ativar o modo automático com a explicação de que ele exige instalar o agente de impressão

#### AC-623 — Com o modo automático ligado, o cupom sai sem ninguém clicar

- **Dado** uma loja com impressão automática ligada e o agente de impressão conectado
- **Quando** um pedido novo é confirmado
- **Então** o cupom é impresso automaticamente em poucos segundos, o pedido registra que foi impresso pelo agente, e ninguém precisou tocar na tela

#### AC-624 — Agente desconectado avisa e não perde cupom

- **Dado** uma loja com impressão automática ligada cujo agente está fora do ar
- **Quando** um pedido novo entra
- **Então** a fila mostra aviso de que a impressão automática está indisponível, o cupom fica aguardando na fila de impressão, o botão de imprimir por clique continua funcionando, e ao agente voltar os cupons pendentes são impressos sem duplicar

#### AC-625 — Cupom nunca é impresso duas vezes por falha de rede

- **Dado** um cupom enviado ao agente cuja confirmação de impressão se perdeu na rede
- **Quando** o sistema tenta novamente
- **Então** o cupom é impresso uma única vez, porque cada trabalho de impressão tem identificador próprio e o agente reconhece o que já imprimiu

#### AC-626 — Desligar o modo automático volta ao clique sem perder nada

- **Dado** uma loja com impressão automática ligada e cupons pendentes na fila
- **Quando** desligo o modo automático
- **Então** os pedidos passam a ser impressos por clique, os cupons pendentes continuam disponíveis para impressão manual, e nada é perdido

## Fora de escopo

- Impressão em impressora conectada por Bluetooth diretamente do celular do dono.
- Roteamento de cupons diferentes para impressoras diferentes (cozinha, bar,
  balcão) — ver Q-601.
- Integração com sistema de entregadores, rastreio em mapa e cálculo de rota.
- Notificação por aplicativo no celular do cliente (push) — a versão 1 usa a
  página de acompanhamento e o WhatsApp.
- Envio automático de mensagem de mudança de status pelo WhatsApp sem ação
  humana: exige a interface oficial paga da Meta.
- Comanda de mesa, controle de garçom e divisão de conta.

## Suposições

| ID      | Suposição                                                                                                                                                          | Status     | Resolução                                                                                                                                                                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ASM-600 | A impressão por clique no navegador é o padrão da versão 1 e o agente de impressão automática é opcional, ativado por chave nas configurações da loja              | confirmada | Decidido pelo dono do produto em 17/08/2026: automático existe como chave opcional, e o padrão é por clique                                                                                                                                                                             |
| ASM-601 | A fila de impressão vive no banco de dados e não apenas na memória, para que nenhum cupom se perca quando o agente ou o servidor reinicia                          | confirmada | Confirmada pela decisão de 17/08/2026 (fila de impressão em PostgreSQL, não em Redis): a fila é a tabela `app.print_jobs` da migração 0034 (T-607)                                                                                                                                      |
| ASM-602 | A fila de pedidos do dono atualiza por conexão contínua com o servidor, com retorno automático a consulta periódica quando a conexão não se sustenta               | aberta     | —                                                                                                                                                                                                                                                                                       |
| ASM-603 | O papel de 80 mm é o mais comum no Brasil, então é o padrão inicial, com 58 mm disponível na configuração                                                          | aberta     | —                                                                                                                                                                                                                                                                                       |
| ASM-604 | O código do link de acompanhamento tem entropia suficiente para não ser adivinhado e não expira, porque o cliente pode voltar a consultar o pedido antigo          | aberta     | —                                                                                                                                                                                                                                                                                       |
| ASM-605 | O agente de impressão é um programa pequeno que o dono instala no computador da loja, sem porta aberta para a internet: ele consulta o servidor, e não o contrário | confirmada | Decidido em 03/10/2026 na orquestração da onda 1: agente em Node/TypeScript dentro do monorepo (`apps/agente-impressao`), com o Node 24 instalado, que consulta o servidor e fala com a impressora de rede na porta 9100; USB fica para decisão futura (ver `.spec/design/decisoes.md`) |
| ASM-606 | A loja tem um computador ou tablet ligado durante o expediente com a fila de pedidos aberta; a operação só pelo celular é possível mas não é o caso principal      | aberta     | —                                                                                                                                                                                                                                                                                       |

## Perguntas em aberto

| ID    | Pergunta                                                                                                                                                       | Status | Resposta |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-600 | Quantos minutos um pedido pode ficar aguardando confirmação no WhatsApp antes de ser descartado automaticamente, ou ele nunca é descartado sozinho?            | aberta | —        |
| Q-601 | A loja precisa imprimir em mais de uma impressora, separando por tipo de item (cozinha e bar), ou uma impressora por loja basta na versão 1?                   | aberta | —        |
| Q-602 | O cliente deve receber mensagem de mudança de status por WhatsApp, ou a página de acompanhamento é suficiente? Envio automático exige a interface paga da Meta | aberta | —        |
| Q-603 | Para quais sistemas o agente de impressão precisa existir na versão 1: apenas Windows, ou também macOS e Linux?                                                | aberta | —        |
| Q-604 | O tempo estimado de preparo deve ser mostrado ao cliente na página de acompanhamento? Se sim, é informado manualmente pelo dono ou calculado pelo histórico?   | aberta | —        |
