# Spec: Sacola lateral, barra móvel e fechamento do pedido (redesign Stitch)

> feature: stitch-sacola-fechamento
> status: rascunho

<!--
  Card #110 do RM Board. Bloco de códigos deste card: 11001 a 11099.
  Redesign de recursos que JÁ EXISTEM: a sacola, a gaveta, o fechamento em
  janela, a conta obrigatória, os endereços, o PIX e o envio pelo WhatsApp.
  Nada aqui está aprovado para implementação. Os critérios descrevem o
  comportamento PROPOSTO para o dono do produto revisar. Nenhuma resposta das
  perguntas foi presumida. Plano técnico proposto em design.md.
-->

## Contexto

O SimpleClick permite criar, personalizar e administrar lojas de diferentes
segmentos e receber os pedidos delas. Esta spec trata da última etapa da
compra do cliente numa loja: revisar a sacola e fechar o pedido.

O Stitch (`cat_logo_de_produtos_desktop_universokar`,
`cat_logo_de_produtos_tablet_universokar` e `cat_logo_de_produtos_universokar`)
mostra três formatos:

- no computador, uma **sacola lateral fixa** à direita do catálogo, com itens,
  −/+, subtotal, entrega, total e o botão principal;
- no tablet e no celular, uma **barra fixa embaixo** com a contagem, o total
  e o botão "Ver sacola";
- a tela de fechamento não foi exportada, então precisa de proposta própria
  (design.md).

Hoje a sacola é um botão redondo arrastável que abre uma janela com dois
passos, sacola e fechamento (`features/carrinho/CarrinhoFlutuante.tsx`). Ela
só aparece nas telas do catálogo. O servidor já recalcula os preços, confere
o estoque, exige conta e evita pedido duplicado. O redesign muda **a
aparência e a organização**. As regras de preço, estoque, conta e pedido não
mudam (ASM-11001).

Universokar e autopeças são só exemplos visuais do Stitch. Cupom, "Compra
segura", previsão de entrega e "PIX ou cartão" do mockup não são conteúdo real
(P-105, P-107).

## Histórias

### US-11001 — Ver a sacola ao lado do catálogo no computador

Como cliente no computador, quero ver a minha sacola ao lado dos produtos,
para acompanhar o que escolhi sem sair do catálogo.

#### AC-11001 — A sacola lateral mostra itens, subtotal e o botão de fechar

- **Dado** um cliente no catálogo de uma loja, numa tela larga o bastante
  para a coluna lateral (ASM-11006), com dois produtos na sacola
- **Quando** a página termina de carregar
- **Então** a coluna lateral mostra o título "Sua sacola", a quantidade de
  itens, cada item com foto, nome, quantidade e preço, e o subtotal
- **E** mostra o botão "Fechar pedido" e a frase de que a entrega é calculada
  no fechamento
- **E** os valores são os da última conferência do servidor, em reais

#### AC-11002 — A sacola lateral não mostra dados pessoais nem a chave PIX

- **Dado** um cliente com conta, endereço salvo e uma loja com chave PIX
- **Quando** a coluna lateral aparece ou é atualizada
- **Então** ela não mostra telefone, endereço nem a chave PIX
- **E** o preparo do fechamento, que é quem traz esses dados, só começa
  quando o cliente aciona "Fechar pedido"

#### AC-11003 — Sacola vazia libera o espaço para os produtos

- **Dado** um cliente no catálogo, numa tela larga, com a sacola vazia
- **Quando** a página carrega ou o último item é removido
- **Então** os produtos ocupam o espaço da coluna da sacola
- **E** nenhuma sacola vazia fica presa na lateral

### US-11002 — Acompanhar a sacola no celular e no tablet

Como cliente no celular ou no tablet, quero ver quanto já escolhi numa barra
fixa, para abrir a sacola com um toque quando quiser fechar.

#### AC-11004 — A barra fixa mostra a contagem, o total e abre a sacola

- **Dado** um cliente no catálogo, numa tela estreita, com três itens na
  sacola
- **Quando** ele rola a lista de produtos
- **Então** uma barra fixa embaixo continua visível com "3 itens", o
  subtotal e o botão "Ver sacola"
- **E** tocar em "Ver sacola" abre a sacola com os itens e o botão "Fechar
  pedido"
- **E** com a sacola vazia, a barra não aparece

#### AC-11005 — A barra fixa não cobre o conteúdo nem outra barra

- **Dado** a barra fixa da sacola visível no catálogo ou na página de um
  produto
- **Quando** o cliente rola até o fim da página
- **Então** o último produto e o rodapé ficam visíveis acima da barra
- **E** a barra respeita a área segura do aparelho (recorte e barra do
  sistema)
- **E** na página do produto ela não cobre o botão de adicionar à sacola
- **E** só uma barra fixa aparece embaixo por vez (ASM-11007)

#### AC-11006 — Adicionar um produto confirma sem roubar o foco

- **Dado** um cliente que escolheu um produto
- **Quando** ele o adiciona à sacola
- **Então** a contagem e o total da barra ou da coluna lateral mudam na hora
- **E** uma confirmação curta é anunciada a leitores de tela, sem tirar o
  foco de onde o cliente estava (Q-11013)

### US-11003 — Ajustar os itens da sacola

Como cliente, quero mudar quantidades e remover itens na própria sacola, para
corrigir o pedido sem voltar ao produto.

#### AC-11007 — Mudar a quantidade ou remover atualiza o valor pelo servidor

- **Dado** uma sacola com um item de quantidade 2
- **Quando** o cliente toca em "+", em "−" ou em "Remover"
- **Então** a quantidade da linha e o subtotal passam a mostrar os valores
  que o servidor devolveu
- **E** "−" fica desabilitado quando a quantidade é 1
- **E** o botão de remover tem um nome acessível com o nome do produto

#### AC-11008 — A linha mostra o que foi escolhido e o atacado que valeu

- **Dado** um item com variação e adicionais escolhidos, numa quantidade que
  atinge uma faixa de atacado
- **Quando** a sacola mostra essa linha
- **Então** a linha diz a variação e os adicionais escolhidos
- **E** mostra o preço de atacado aplicado e o preço de varejo riscado

#### AC-11009 — Falha ao mudar a quantidade não engana o cliente

- **Dado** uma sacola aberta e o servidor indisponível
- **Quando** o cliente toca em "+"
- **Então** a linha volta a mostrar a quantidade anterior
- **E** aparece um aviso de que não foi possível mudar, com a opção de tentar
  de novo

### US-11004 — Dizer como quer receber e pagar

Como cliente, quero escolher entrega ou retirada e a forma de pagamento que a
loja aceita, para a loja preparar o pedido do jeito certo.

#### AC-11010 — Entrega e retirada aparecem conforme a loja oferece

- **Dado** uma loja que oferece entrega e retirada
- **Quando** o cliente abre o fechamento
- **Então** ele escolhe entre "Entrega" e "Retirada"
- **E** numa loja com uma forma só, aparece uma frase com essa forma, sem
  opção para escolher
- **E** numa loja sem nenhuma das duas, o fechamento explica que a loja não
  está recebendo pedidos e não deixa concluir

#### AC-11011 — Endereço salvo, taxa por bairro e pedido mínimo

- **Dado** um cliente com dois endereços salvos, numa loja com taxa por
  bairro e pedido mínimo
- **Quando** ele escolhe "Entrega" e um dos endereços
- **Então** o resumo mostra a taxa do bairro desse endereço somada ao total
- **E** abaixo do pedido mínimo, o fechamento diz quanto falta e não deixa
  concluir
- **E** ele pode cadastrar um endereço novo sem sair do fechamento

#### AC-11012 — Só as formas de pagamento da loja aparecem

- **Dado** uma loja que aceita PIX e dinheiro
- **Quando** o cliente chega ao pagamento
- **Então** só PIX e dinheiro aparecem como opção
- **E** escolhendo PIX, a chave da loja aparece com um botão de copiar
- **E** escolhendo dinheiro, ele pode informar o troco para quanto
- **E** nenhuma etapa pede dado de cartão nem cobra de verdade

#### AC-11013 — Dado recusado aparece no campo certo sem perder o resto

- **Dado** um fechamento preenchido em que o servidor recusa o telefone ou
  exige o endereço
- **Quando** o cliente confirma
- **Então** a mensagem aparece junto do campo com problema
- **E** a forma de receber, o pagamento e a observação continuam
  preenchidos

### US-11005 — Revisar o total e finalizar sem pedidos duplicados

Como cliente, quero revisar os itens e o total e finalizar o meu pedido sem
duplicações.

#### AC-11014 — O total que o cliente vê é o que o servidor validou

- **Dado** uma sacola com itens e taxa de entrega aplicável
- **Quando** o cliente revê o pedido antes de confirmar
- **Então** o subtotal mostrado é o da última conferência do servidor
- **E** quando o total inclui taxa de entrega, ele aparece como estimativa
  até o pedido ser criado (ASM-11003)
- **E** depois de criado, a tela mostra o subtotal, a taxa e o total que o
  servidor gravou no pedido

#### AC-11015 — Mudança de preço ou de estoque é avisada antes de concluir

- **Dado** uma sacola em que um preço subiu e um item esgotou depois que o
  cliente o adicionou
- **Quando** ele confirma o pedido
- **Então** a tela diz o que mudou em cada item e mostra o valor novo
- **E** o pedido só é enviado depois que ele aceitar as mudanças

#### AC-11016 — Todo envio leva o subtotal que o cliente viu

- **Dado** um fechamento pronto para confirmar
- **Quando** o pedido é enviado
- **Então** o envio leva o subtotal e o total da última conferência que o
  cliente viu
- **E** se o servidor achar o subtotal diferente, o pedido não é criado e a
  tela pede uma nova revisão

#### AC-11017 — Confirmar várias vezes cria um pedido só

- **Dado** um cliente que toca várias vezes em "Confirmar pedido" enquanto a
  resposta demora
- **Quando** os envios chegam ao servidor
- **Então** só um pedido é criado
- **E** o botão fica ocupado e desabilitado enquanto espera
- **E** uma nova tentativa recebe de volta o mesmo pedido, com o mesmo
  número

#### AC-11018 — A chave de repetição vale só para a tentativa atual

- **Dado** um pedido que acabou de ser criado
- **Quando** o cliente adiciona outros produtos e fecha um pedido novo, ou
  troca de conta, ou passa para outra loja
- **Então** o pedido novo é criado de verdade, e não devolve o pedido
  anterior
- **E** a chave que identifica a tentativa nunca é guardada no navegador nem
  aparece em endereço da página ou em registro

#### AC-11019 — Duas abas não criam dois pedidos da mesma sacola

- **Dado** a mesma sacola aberta em duas abas
- **Quando** o cliente confirma nas duas
- **Então** só uma cria o pedido
- **E** a outra informa que não foi possível concluir e não cria outro pedido

#### AC-11020 — Sem conta, o cliente entra e continua com a mesma sacola

- **Dado** um cliente sem conta, ou com a sessão expirada, e três itens na
  sacola
- **Quando** ele aciona "Fechar pedido"
- **Então** abre a janela para entrar ou criar conta
- **E** depois de entrar, a sacola continua com os três itens
- **E** nome, telefone e endereços do fechamento são os da conta que entrou,
  e nunca os da anterior

#### AC-11021 — Loja fechada informa quando abre e guarda a sacola

- **Dado** uma loja que fechou enquanto o cliente montava o pedido
- **Quando** ele confirma
- **Então** o pedido não é criado e a tela informa o horário em que a loja
  abre
- **E** a sacola continua com os itens

#### AC-11022 — Pedido criado leva ao próximo passo e esvazia a sacola

- **Dado** um pedido confirmado com sucesso
- **Quando** a resposta chega
- **Então** a tela mostra o número do pedido e o próximo passo: enviar pelo
  WhatsApp da loja, quando a loja usa, ou acompanhar o pedido
- **E** a barra fixa e a coluna lateral passam a mostrar a sacola vazia

#### AC-11023 — Nada de cupom, parcelamento ou promessa do mockup

- **Dado** qualquer loja, enquanto as funções "A decidir" não forem aprovadas
- **Quando** o cliente vê a sacola ou o fechamento
- **Então** não aparece campo de cupom, linha de desconto de cupom ou de
  fidelidade, parcelamento, boleto, previsão de entrega nem selo "Compra
  segura"
- **E** as formas de pagamento citadas são só as que a loja configurou

### US-11006 — Usar a sacola com teclado, com segurança e sem perder caminhos

Como cliente, quero usar a sacola com teclado ou leitor de tela, sem expor os
meus dados e pelos mesmos endereços de hoje.

#### AC-11024 — A sacola em diálogo modal prende o foco, fecha com Esc e devolve o foco

- **Dado** a sacola aberta como diálogo modal: a gaveta de baixo no celular e
  no tablet, ou o fechamento, que é a mesma janela em outro passo (ASM-11012)
- **Quando** o cliente navega só pelo teclado e aperta Esc
- **Então** Tab e Shift+Tab ficam dentro do diálogo e o resto da página fica
  inacessível por teclado e por leitor de tela enquanto ele está aberto
- **E** Esc fecha o diálogo inteiro, nos dois passos, e a sacola continua com os
  itens
- **E** o foco volta ao botão que abriu o diálogo
- **E** sem esse botão (abertura por `/carrinho` ou `/checkout`, botão que
  sumiu porque a sacola esvaziou, ou navegador que não dá foco ao toque) o foco
  vai ao título da página do catálogo, e nunca ao corpo da página
- **E** o diálogo tem nome acessível "Sua sacola" ou "Fechar pedido"

#### AC-11028 — A coluna lateral persistente não prende o foco nem fecha com Esc

- **Dado** a coluna lateral da sacola no computador, com itens, ao lado dos
  produtos (ASM-11012)
- **Quando** o cliente percorre a página só pelo teclado
- **Então** a coluna é uma região com nome "Sua sacola" e o foco entra e sai dela
  livremente, sem ficar preso
- **E** o primeiro Tab da página oferece o atalho "Ir para a sacola", que leva
  o foco ao título da coluna, para não ser preciso passar por todos os produtos
- **E** Esc dentro da coluna não a fecha nem move o foco
- **E** os produtos continuam acessíveis por teclado e por leitor de tela
- **E** se o cliente puder fechar a coluna (Q-11002), o foco passa ao ícone de
  sacola do topo (#105), que a reabre

#### AC-11029 — Abrir a sacola pelo topo leva o foco ao lugar certo

- **Dado** o ícone de sacola do topo (#105), que pede para abrir a sacola
  pelo evento `sc:abrir-sacola` (ASM-11011; AC-10510 do #105)
- **Quando** o cliente o aciona
- **Então** no computador, com a coluna visível, o foco vai ao título "Sua
  sacola" da coluna, sem abrir diálogo
- **E** no computador, com a coluna fechada (Q-11002), ela reabre e recebe o
  foco no título
- **E** no celular e no tablet abre o diálogo modal do AC-11024
- **E** com a sacola vazia, uma mensagem "Sua sacola está vazia" é anunciada ao
  leitor de tela e o foco não se move
- **E** com um diálogo já aberto (janela do produto, por exemplo), o pedido é
  ignorado, porque o topo fica inacessível enquanto ele está aberto

#### AC-11030 — Mudar a largura da tela troca de forma sem perder o foco nem a sacola

- **Dado** a sacola numa forma só (coluna no computador, barra e diálogo no
  celular e no tablet)
- **Quando** a largura da janela passa o ponto de troca (ASM-11006)
- **Então** a sacola muda de forma com os mesmos itens e valores
- **E** a coluna que encolhe vira a barra fixa, e nunca abre um diálogo sozinha;
  se o foco estava dentro da coluna, ele vai ao botão "Ver sacola" da barra
- **E** o diálogo aberto que alarga fecha e a coluna aparece, com o foco no
  título dela
- **E** em nenhum caso o foco fica no corpo da página

#### AC-11025 — Os endereços de hoje continuam levando à sacola e ao fechamento

- **Dado** um cliente que abre `/loja/<loja>/carrinho` ou
  `/loja/<loja>/checkout`
- **Quando** a página carrega
- **Então** a sacola ou o fechamento aparecem abertos
- **E** sem script no navegador, o link da sacola continua levando ao
  fechamento

#### AC-11026 — Sacola e conta não vêm no HTML do servidor

- **Dado** um cliente com itens na sacola numa loja
- **Quando** o servidor monta a página do catálogo
- **Então** o HTML não traz itens da sacola, nome, telefone nem endereço
- **E** a sacola é lida pelo navegador, sem cache
- **E** ao passar para outra loja, a sacola mostrada é a da loja nova

#### AC-11027 — Registros e eventos não carregam dados pessoais

- **Dado** um fechamento com erro ou com sucesso
- **Quando** o navegador registra o erro ou o evento
- **Então** o registro não contém endereço, telefone, chave PIX nem a chave
  da tentativa

## Fora do escopo

- Mudar banco, API, contratos ou o cálculo do total (ASM-11001). O que
  exigiria API vira pergunta: Q-11007, Q-11008 e Q-11011.
- Cupom (#119), fidelidade (#125), parcelamento e boleto (#126) e novas
  formas de pagamento: ocultos até decisão (P-107).
- Previsão de entrega (Q-11009), selos "Compra segura" e qualquer número do
  mockup (P-105).
- Escolher variação e adicionais no produto (#109) e o layout do catálogo
  (#108). Esta spec começa na linha da sacola.
- Funções automotivas: o "Checar chassi" do tablet fica fora (P-104).
- Implementar código, alterar testes, publicar ou commit nesta fase.

## Suposições

| ID        | Suposição                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Status | Resolução |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-11001 | Nenhuma regra comercial nova: preço, estoque, taxa, conta obrigatória e criação do pedido continuam como estão no servidor; o redesign muda só a tela                                                                                                                                                                                                                                                                                                                             | aberta | —         |
| ASM-11002 | Cupom, fidelidade, parcelamento e novas formas de pagamento ficam ocultos; nenhuma linha de desconto aparece até o #119 ou o #125 ser aprovado e dono do contrato de descontos                                                                                                                                                                                                                                                                                                    | aberta | —         |
| ASM-11003 | Hoje uma taxa de entrega diferente da mostrada não barra o pedido: o servidor só registra a diferença; por isso o total com taxa é chamado de estimativa até o pedido ser criado                                                                                                                                                                                                                                                                                                  | aberta | —         |
| ASM-11004 | A sacola pertence à sessão do navegador, não à conta; num aparelho compartilhado, quem entra depois vê a sacola deixada na sessão                                                                                                                                                                                                                                                                                                                                                 | aberta | —         |
| ASM-11005 | A proteção contra envio forjado continua baseada em chamadas JSON do navegador com cookie restrito ao site e origens fechadas; o redesign não cria formulário de envio nativo nem ação de servidor que grave                                                                                                                                                                                                                                                                      | aberta | —         |
| ASM-11006 | A coluna lateral usa a região `.sc-catalogo__sacola` que o #108 reserva no catálogo (AC-10808 a AC-10810 do #108) (proposta a partir de 1280px, grade 3/6/3); abaixo dessa largura vale a barra fixa                                                                                                                                                                                                                                                                              | aberta | —         |
| ASM-11007 | No celular, só uma barra fixa por vez: no catálogo com itens, a barra da sacola substitui a barra inferior do #105, que expõe a altura dela para o empilhamento                                                                                                                                                                                                                                                                                                                   | aberta | —         |
| ASM-11008 | A sacola continua só nas telas do catálogo (cardápio, produto, sacola e fechamento); a vitrine e o Sobre não ganham sacola sem decisão (Q-11010)                                                                                                                                                                                                                                                                                                                                  | aberta | —         |
| ASM-11009 | "PIX ou cartão" do mockup vira a lista das formas que a loja configurou; os selos "Compra segura" não entram                                                                                                                                                                                                                                                                                                                                                                      | aberta | —         |
| ASM-11010 | Os textos e valores do mockup (código de cupom, "motoboy express", totais, nomes de peças) não são usados nem como exemplo de produção                                                                                                                                                                                                                                                                                                                                            | aberta | —         |
| ASM-11011 | O ícone de sacola do topo (#105) abre a mesma sacola desta spec, sem criar outra                                                                                                                                                                                                                                                                                                                                                                                                  | aberta | —         |
| ASM-11012 | Contrato único de teclado: o diálogo modal (gaveta do celular e do tablet, janela do fechamento) prende o foco, fecha com Esc e devolve o foco; a coluna lateral persistente do computador é uma região não modal, sem foco preso e sem Esc. Se a Q-11001 escolher gaveta lateral no computador, o AC-11028 passa a seguir o AC-11024; se a Q-11004 escolher o fechamento dentro da coluna, ele fica na região não modal, com um botão "Voltar à sacola" e sem foco preso nem Esc | aberta | —         |

## Perguntas em aberto

| ID      | Pergunta                                                                                                                                                                | Status | Resposta |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-11001 | No computador, a sacola fica numa coluna lateral fixa (como no Stitch, sem escurecer a página) ou numa gaveta lateral que abre por botão?                               | aberta | —        |
| Q-11002 | A coluna lateral pode ser fechada pelo cliente (o X do Stitch) ou fica sempre aberta quando há itens?                                                                   | aberta | —        |
| Q-11003 | No celular e no tablet, a barra fixa substitui o botão redondo arrastável de hoje (e a posição guardada dele é apagada) ou o botão continua?                            | aberta | —        |
| Q-11004 | O fechamento continua numa janela em dois passos (sacola e depois fechamento) ou, no computador, abre dentro da própria coluna lateral?                                 | aberta | —        |
| Q-11005 | Mostrar a "economia de atacado" (quanto o cliente economizou com o atacado) na barra fixa e na coluna lateral?                                                          | aberta | —        |
| Q-11006 | O botão principal diz sempre "Fechar pedido" ou diz "Fechar pedido pelo WhatsApp" nas lojas que usam WhatsApp, sabendo que o pedido é criado antes de abrir a conversa? | aberta | —        |
| Q-11007 | Uma taxa de entrega diferente da mostrada deve barrar o pedido e pedir confirmação ao cliente? Isso muda a API e seria de outro card                                    | aberta | —        |
| Q-11008 | Quando a sacola já virou pedido (outra aba ou resposta perdida), a tela deve dizer "seu pedido já foi criado" com o link dele? Isso muda a API e seria de outro card    | aberta | —        |
| Q-11009 | A previsão de entrega ("hoje até 18:00" no Stitch) fica fora até a loja poder cadastrar prazos?                                                                         | aberta | —        |
| Q-11010 | A sacola deve aparecer também na vitrine da loja e no Sobre? Isso envolve a moldura da loja (#105) e a vitrine (#107)                                                   | aberta | —        |
| Q-11011 | Ao sair da conta, a sacola da sessão deve ser esvaziada, por causa de aparelhos compartilhados? Isso muda a API e seria de outro card                                   | aberta | —        |
| Q-11012 | Os botões da sacola seguem a decisão de alvo de toque de 48px da Q-10405?                                                                                               | aberta | —        |
| Q-11013 | No computador, depois de adicionar um produto, basta atualizar a coluna lateral ou também aparece o aviso flutuante?                                                    | aberta | —        |
