# Spec: Configurações da Loja

> feature: config-loja
> status: rascunho

## Contexto

Esta feature existe porque o crítico de completude achou o maior furo do pacote:
onze critérios de aceite espalhados por checkout, vitrine e impressão **consomem**
configurações que nenhum critério permitia **criar**. O checkout mostra a chave
PIX, soma taxa de entrega e monta a mensagem de WhatsApp; a vitrine diz se a loja
está aberta; o cupom sai em 58 ou 80 mm. Tudo isso é configuração do dono, e sem
ela nada do resto funciona. É também aqui que mora a página de boas-vindas da
loja — herdada do `boasvindas.html` do primeiro SimpleClick, que tinha texto e
identidade e ninguém editava.

## Histórias

### US-900 — Dono cadastra a chave PIX que o cliente vai pagar

Como dono de loja, quero cadastrar minha chave PIX, para que meu cliente pague
sem eu ditar a chave por mensagem a cada pedido.

#### AC-900 — Chave PIX cadastrada passa a aparecer no checkout

- **Dado** que sou dono de loja e ainda não cadastrei chave PIX
- **Quando** informo o tipo de chave (CPF, CNPJ, telefone, e-mail ou aleatória), a chave e o nome do recebedor, e salvo
- **Então** a confirmação aparece, o PIX passa a ser oferecido como forma de pagamento no meu checkout, e a chave é exibida ao cliente junto do nome do recebedor

#### AC-901 — Chave em formato inválido para o tipo escolhido é recusada

- **Dado** que escolhi o tipo de chave CPF
- **Quando** informo um valor que não é um CPF válido
- **Então** o formulário recusa explicando o formato esperado para aquele tipo, e a chave anterior, se houver, continua valendo

#### AC-902 — Loja sem chave PIX não oferece PIX no checkout

- **Dado** uma loja que não cadastrou chave PIX
- **Quando** o cliente chega ao pagamento
- **Então** o PIX não aparece entre as formas de pagamento, as outras formas configuradas continuam disponíveis, e se nenhuma forma estiver configurada o painel do dono mostra aviso de que falta configurar pagamento

#### AC-903 — Trocar a chave não altera pedido já feito

- **Dado** pedidos antigos feitos com a chave PIX anterior
- **Quando** eu troco a chave
- **Então** os pedidos antigos continuam exibindo a chave que valia no momento da compra e os pedidos novos passam a usar a chave nova

#### AC-904 — Chave PIX não aparece em lugar indevido

- **Dado** uma loja com chave PIX cadastrada
- **Quando** os dados públicos da vitrine são consultados por qualquer pessoa
- **Então** a chave PIX não vem na resposta, aparecendo somente no fechamento de um pedido daquela loja, e nunca em registro de sistema

### US-901 — Dono define como entrega e quanto cobra

Como dono de loja, quero configurar se entrego, se o cliente retira e quanto
custa a entrega, para que o checkout calcule certo sem eu combinar por mensagem.

#### AC-905 — Modos de recebimento configurados aparecem no checkout

- **Dado** que sou dono de loja
- **Quando** ativo entrega, retirada, ou as duas
- **Então** o checkout passa a oferecer exatamente o que ativei, e desativar as duas impede o cliente de finalizar pedido com aviso claro no meu painel

#### AC-906 — Taxa de entrega única é somada ao pedido

- **Dado** que configurei taxa de entrega única de R$ 8,00
- **Quando** o cliente escolhe entrega
- **Então** a taxa aparece em linha separada no resumo e entra no total, com o nome que eu dei a ela

#### AC-907 — Entrega grátis acima de um valor é respeitada

- **Dado** que configurei entrega grátis para pedidos acima de R$ 60,00
- **Quando** o cliente fecha um pedido de R$ 70,00 com entrega
- **Então** a taxa aparece zerada com indicação de entrega grátis, e um pedido de R$ 50,00 continua pagando a taxa

#### AC-908 — Valor mínimo de pedido é aplicado com aviso

- **Dado** que configurei valor mínimo de R$ 25,00 para entrega
- **Quando** o cliente tenta fechar um pedido de R$ 20,00 com entrega
- **Então** o checkout impede, informa quanto falta para atingir o mínimo, e a retirada continua permitida se eu não tiver definido mínimo para ela

### US-902 — Dono define o horário de funcionamento

Como dono de loja, quero configurar meus horários por dia da semana e fechar
pontualmente quando preciso, para que o cliente não faça pedido quando estou
fechado.

#### AC-909 — Horário por dia da semana controla a vitrine

- **Dado** que configurei funcionamento de terça a domingo, das 18h às 22h30
- **Quando** o cliente abre a vitrine numa segunda-feira ou às 23h de um sábado
- **Então** a loja aparece como fechada com o horário da próxima abertura, e dentro da faixa configurada aparece como aberta, sempre no fuso da minha loja

#### AC-910 — Mais de uma faixa no mesmo dia é aceita

- **Dado** que abro para almoço das 11h às 14h e para jantar das 18h às 23h
- **Quando** configuro as duas faixas no mesmo dia
- **Então** as duas valem, e no intervalo entre elas a loja aparece fechada com o horário da próxima faixa

#### AC-911 — Fechar agora não desconfigura a semana

- **Dado** que minha cozinha atolou e preciso parar de receber pedido hoje
- **Quando** uso o fechamento temporário
- **Então** a vitrine passa a indicar que não estou recebendo pedidos agora, meu horário semanal permanece intacto, e ao desligar o fechamento temporário volto a receber

#### AC-912 — Feriado e férias são exceções datadas

- **Dado** que vou fechar no dia 25 de dezembro
- **Quando** cadastro essa data como exceção
- **Então** naquele dia a loja aparece fechada mesmo estando dentro do horário semanal, e nos outros dias nada muda

### US-903 — Dono configura o contato e a mensagem do pedido

Como dono de loja, quero cadastrar meu número de WhatsApp e ajustar o texto do
pedido, para que a mensagem chegue no meu número e do jeito que eu quero ler.

#### AC-913 — Número de WhatsApp é validado no cadastro

- **Dado** que estou configurando meu contato
- **Quando** informo o número de WhatsApp com máscara, com espaços ou sem o código do país
- **Então** o sistema normaliza para o formato internacional, mostra como ficou, e recusa número impossível explicando o que falta — porque número errado gera link que abre conversa inexistente

#### AC-914 — Sem número de WhatsApp o checkout avisa antes de o cliente pedir

- **Dado** uma loja sem número de WhatsApp configurado
- **Quando** o dono abre o painel
- **Então** existe aviso destacado de configuração pendente, e o pedido do cliente continua sendo registrado no sistema mesmo sem o envio pelo WhatsApp

#### AC-915 — Dono ajusta o texto da mensagem do pedido

- **Dado** o texto padrão da mensagem de pedido
- **Quando** edito o texto para incluir minha saudação e retirar o que não quero
- **Então** a pré-visualização mostra como a mensagem fica com um pedido de exemplo, os campos obrigatórios do pedido não podem ser removidos, e a mensagem sai sem marca do SimpleClick

### US-904 — Dono edita a página de apresentação da loja

Como dono de loja, quero escrever minha apresentação e aplicar minha identidade,
para que minha página não seja igual à de todo mundo.

#### AC-916 — Apresentação editada aparece na página da loja

- **Dado** que sou dono de loja
- **Quando** edito o nome de exibição, a mensagem de boas-vindas e o texto sobre o negócio, e envio a logo e a imagem de capa
- **Então** a página pública da minha loja passa a mostrar exatamente isso, e a pré-visualização me mostra o resultado antes de publicar

#### AC-917 — Cor escolhida pelo dono não deixa texto ilegível

- **Dado** que escolhi uma cor principal muito clara para a minha marca
- **Quando** a vitrine é renderizada
- **Então** o sistema ajusta a cor do texto sobre aquela cor para manter o contraste acessível, e me avisa se a cor escolhida compromete a legibilidade

#### AC-918 — Imagem fora do padrão é recusada com orientação

- **Dado** que estou enviando a imagem de capa
- **Quando** envio arquivo que não é imagem, ou imagem acima do tamanho permitido
- **Então** o envio é recusado explicando o formato e o tamanho aceitos e a proporção recomendada, e a imagem anterior continua no ar

### US-905 — Dono configura como o pedido é impresso

Como dono de loja, quero dizer qual é o meu papel e o que sai no cupom, para que
a comanda saia do tamanho certo para a minha impressora.

#### AC-919 — Largura de papel configurada é respeitada no cupom

- **Dado** que configurei papel de 58 mm
- **Quando** o cupom de um pedido é gerado
- **Então** ele sai formatado para 58 mm, e ao trocar para 80 mm o mesmo pedido passa a sair formatado para 80 mm

#### AC-920 — Dono escolhe o que aparece no cupom

- **Dado** as opções de conteúdo do cupom
- **Quando** desligo a impressão do endereço do cliente e ligo a impressão do valor total em destaque
- **Então** o cupom seguinte reflete as duas escolhas, e as informações essenciais do pedido não podem ser desligadas

### US-906 — Quem pode configurar o quê fica claro

Como administrador geral, quero que a fronteira entre o que o dono configura e o
que só eu configuro seja explícita, para que ninguém altere o que não deve.

#### AC-921 — Dono configura a operação, não o cadastro da plataforma

- **Dado** que sou dono de loja
- **Quando** percorro minhas configurações
- **Então** encontro pagamento, entrega, horário, contato, apresentação e impressão, e não encontro tipo de negócio, apelido da loja, documento, contrato nem funcionalidades liberadas — que pertencem à administração da plataforma

#### AC-922 — Toda alteração de configuração é registrada

- **Dado** qualquer alteração de configuração da loja
- **Quando** ela é salva
- **Então** o histórico de auditoria registra quem alterou, quando, o que mudou e o valor anterior, e alterações sensíveis como a chave PIX ficam destacadas nesse histórico

#### AC-923 — Configuração inválida não deixa a loja num estado quebrado

- **Dado** uma loja publicada e funcionando
- **Quando** uma alteração de configuração é enviada com dados inválidos ou incompletos
- **Então** nada é salvo parcialmente, a configuração anterior continua valendo, e a tela aponta cada campo com problema

## Fora de escopo

- Taxa de entrega por bairro ou por raio de distância: a versão 1 tem taxa única
  e entrega grátis acima de um valor — ver Q-900.
- Cupom de desconto e programa de fidelidade, que também são configuração do dono
  — ver Q-302 na feature de catálogo.
- Integração com serviço de entrega terceirizado.
- Múltiplas unidades da mesma marca com configuração compartilhada.
- Configuração de impressoras diferentes por tipo de item — ver Q-601.
- Domínio próprio da loja — ver Q-201 na feature de administração.

## Suposições

| ID      | Suposição                                                                                                                                                    | Status     | Resolução                                                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ASM-900 | A chave PIX é texto validado apenas no formato do tipo escolhido, sem consulta ao banco para confirmar titularidade                                          | aberta     | —                                                                                                                                                                       |
| ASM-901 | O dono configura sozinho pagamento, entrega, horário, contato, apresentação e impressão, dentro da própria loja, sem depender da administração da plataforma | confirmada | Decidido pelo dono do produto em 17/08/2026: "ele cadastrar cada um desses dados dentro da loja dele: a chave PIX, o horário de funcionamento, a taxa de entrega e etc" |
| ASM-902 | As configurações ficam em estrutura flexível validada por esquema, com versão, e só o que entra em índice ou política vira coluna própria                    | aberta     | —                                                                                                                                                                       |
| ASM-903 | O fuso da loja é definido no cadastro pela administração e usado em todo cálculo de aberto ou fechado e de corte de data                                     | aberta     | —                                                                                                                                                                       |
| ASM-904 | Uma loja tem um único número de WhatsApp e uma única chave PIX na versão 1                                                                                   | aberta     | —                                                                                                                                                                       |
| ASM-905 | A mensagem do pedido tem campos obrigatórios que o dono não pode remover, para que o pedido nunca chegue incompleto                                          | aberta     | —                                                                                                                                                                       |

## Perguntas em aberto

| ID    | Pergunta                                                                                                                                            | Status     | Resposta                                                                                                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-900 | A taxa de entrega precisa variar por bairro ou por distância já na versão 1, ou taxa única com entrega grátis acima de um valor basta para começar? | aberta     | —                                                                                                                                                                                      |
| Q-901 | O dono pode alterar a chave PIX sozinho, ou por ser dado financeiro sensível a alteração deve passar pela administração da plataforma?              | respondida | O dono altera sozinho, dentro da loja dele (decisão de 17/08/2026). A mitigação é registro destacado no histórico de auditoria (AC-922) e aviso por e-mail ao dono quando a chave muda |
| Q-902 | Quanto o dono pode editar da mensagem do WhatsApp? Só a saudação e o encerramento, ou o texto todo, com risco de remover informação importante?     | aberta     | —                                                                                                                                                                                      |
| Q-903 | A loja pode ter formas de pagamento com instrução própria (por exemplo "cartão só na entrega, maquininha própria")?                                 | aberta     | —                                                                                                                                                                                      |
