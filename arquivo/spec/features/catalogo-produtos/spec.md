# Spec: Catálogo e Produtos

> feature: catalogo-produtos
> status: rascunho

## Contexto

É aqui que o empreendedor monta o que vende — e o desafio central do SimpleClick
vive nesta feature: **o mesmo cadastro precisa servir uma lanchonete, uma loja de
roupas, uma autopeça e uma loja de eletrônicos**. O primeiro SimpleClick já
apontava o caminho na tela de detalhe do produto: "Escolha o Sabor" era escolha
única obrigatória e "Adicionais" era escolha múltipla opcional — o mesmo
mecanismo que, em uma loja de roupas, vira tamanho e cor. Esta feature entrega
categorias criadas pelo dono, produtos com imagens, mais de um preço, descrição
e grupos de opção que cobrem ingrediente e variação.

## Histórias

### US-300 — Dono cria e organiza as categorias do próprio negócio

Como dono de loja, quero criar minhas próprias categorias e definir a ordem em
que aparecem, para que minha vitrine reflita como eu penso meu negócio.

#### AC-300 — Categoria criada aparece na vitrine na posição escolhida

- **Dado** que sou dono de loja e estou na área de categorias
- **Quando** crio a categoria com nome, descrição opcional e a marco como visível
- **Então** ela aparece na minha lista e na vitrine pública na posição que defini, e a lista trata os estados de carregando, vazio e erro

#### AC-301 — Categoria oculta desaparece da vitrine sem perder produtos

- **Dado** uma categoria visível com produtos dentro
- **Quando** eu a marco como oculta
- **Então** ela deixa de aparecer na vitrine pública junto com seus produtos, continua na minha área de gestão marcada como oculta, e nenhum produto é apagado

#### AC-302 — Reordenar categorias muda a vitrine na hora

- **Dado** três categorias na ordem Lanches, Bebidas, Sobremesas
- **Quando** movo Sobremesas para a primeira posição
- **Então** a vitrine pública passa a listar Sobremesas primeiro na próxima visita, sem precisar mexer em produto nenhum

#### AC-303 — Apagar categoria com produtos exige destino

- **Dado** uma categoria com cinco produtos
- **Quando** peço para apagá-la
- **Então** o sistema pede que eu escolha mover os produtos para outra categoria ou ocultá-los, e não me deixa criar produto órfão sem categoria

### US-301 — Dono cadastra um produto completo

Como dono de loja, quero cadastrar produto com nome, descrição, imagens e preço,
para que meu cliente veja exatamente o que estou vendendo.

#### AC-304 — Produto novo nasce completo e visível na vitrine

- **Dado** que sou dono de loja com ao menos uma categoria criada
- **Quando** cadastro produto com nome, descrição, categoria, preço base e uma imagem
- **Então** o produto aparece na minha lista e na vitrine dentro da categoria escolhida, com a imagem exibida sem distorção e sem estourar o contêiner no menor tamanho de tela

#### AC-305 — Produto aceita várias imagens com uma principal

- **Dado** que estou editando um produto
- **Quando** envio três imagens e escolho qual é a principal
- **Então** a vitrine mostra a principal no cartão do produto, a página de detalhe permite ver as três, e eu consigo trocar qual é a principal depois

#### AC-306 — Imagem grande é aceita e otimizada, imagem inválida é recusada

- **Dado** que estou enviando a imagem de um produto
- **Quando** envio um arquivo de imagem grande dentro do limite permitido
- **Então** a imagem é aceita e servida em tamanho adequado ao dispositivo; e quando envio arquivo que não é imagem de verdade, o envio é recusado com aviso claro (a checagem olha o conteúdo, não a extensão)

#### AC-307 — Produto pode ser editado, duplicado e removido

- **Dado** um produto já cadastrado
- **Quando** altero seus dados, duplico para criar um parecido, ou o removo
- **Então** a alteração aparece na vitrine, a duplicata nasce como rascunho oculto com os mesmos dados, e a remoção tira o produto da vitrine sem afetar pedidos que já o incluíram

#### AC-308 — Produto pode ficar rascunho antes de ir ao ar

- **Dado** que estou montando um produto e ainda não quero divulgá-lo
- **Quando** o salvo como rascunho
- **Então** ele aparece na minha gestão marcado como rascunho e não aparece na vitrine pública de forma alguma, nem por endereço direto

### US-302 — Dono define mais de um preço para o mesmo produto

Como dono de loja, quero cadastrar mais de um preço no mesmo produto, para que
eu trabalhe com preço promocional e preço de atacado sem duplicar cadastro.

#### AC-309 — Preço base e preço promocional aparecem corretamente

- **Dado** um produto com preço base de R$ 20,00
- **Quando** cadastro preço promocional de R$ 15,00 e o ativo
- **Então** a vitrine mostra R$ 15,00 como preço a pagar e R$ 20,00 riscado ao lado, e o carrinho usa R$ 15,00 no cálculo

#### AC-310 — Preço adicional nomeado pelo dono é oferecido na compra

- **Dado** um produto com preço base e um terceiro preço que nomeei como Atacado, válido a partir de seis unidades
- **Quando** o cliente adiciona seis unidades ao carrinho
- **Então** o preço de atacado é aplicado automaticamente e a tela mostra qual preço foi usado e por quê

#### AC-311 — Valor monetário nunca perde centavo

- **Dado** um produto com preço de R$ 19,99 e um pedido com três unidades
- **Quando** o total é calculado
- **Então** o total é exatamente R$ 59,97, calculado em centavos inteiros no servidor, sem arredondamento de ponto flutuante

#### AC-312 — Preço enviado pelo cliente é ignorado

- **Dado** um pedido sendo criado
- **Quando** a requisição inclui um preço diferente do cadastrado no produto
- **Então** o preço enviado é descartado, o valor do banco é o que vale, e a tentativa fica registrada no log de segurança

### US-303 — Dono descreve ingredientes e variações no mesmo mecanismo

Como dono de loja, quero montar grupos de escolha no produto, para que uma
lanchonete ofereça sabor e adicionais e uma loja de roupas ofereça tamanho e
cor, sem eu precisar de dois sistemas diferentes.

#### AC-313 — Grupo de escolha única obrigatória exige uma opção

- **Dado** um pastel com o grupo Sabor marcado como obrigatório, escolha mínima 1 e máxima 1
- **Quando** o cliente tenta adicionar ao carrinho sem escolher sabor
- **Então** a tela impede e aponta o grupo pendente, e ao escolher um sabor o produto entra no carrinho com o sabor registrado

#### AC-314 — Grupo de escolha múltipla respeita o limite

- **Dado** um produto com o grupo Adicionais permitindo até três escolhas
- **Quando** o cliente tenta marcar a quarta opção
- **Então** a tela avisa que o limite do grupo foi atingido e não registra a quarta escolha

#### AC-315 — Opção com acréscimo soma ao preço na hora

- **Dado** um produto de R$ 20,00 com a opção Bacon custando mais R$ 3,00
- **Quando** o cliente marca Bacon
- **Então** o valor exibido do item passa a R$ 23,00 antes de ir ao carrinho, e o pedido registra o acréscimo separado do preço base

#### AC-316 — Variação com estoque e código próprio é controlada

- **Dado** uma camiseta com variações de tamanho P, M e G, e o tamanho M com estoque zerado
- **Quando** o cliente abre o produto
- **Então** o tamanho M aparece indisponível e não pode ser escolhido, os outros continuam disponíveis, e cada variação tem seu próprio código de estoque quando o dono informa

#### AC-317 — Opção esgotada não bloqueia o produto inteiro

- **Dado** um produto com o grupo Adicionais onde apenas o item Cheddar está esgotado
- **Quando** o cliente abre o produto
- **Então** Cheddar aparece indisponível, os outros adicionais seguem disponíveis, e o produto continua podendo ser comprado

### US-304 — Sistema inteiro fala a língua do negócio

Como dono de uma autopeça, quero que o sistema todo use as palavras do meu ramo,
para que ninguém chame meus produtos de cardápio nem me peça ingredientes de uma
pastilha de freio.

#### AC-318 — Vocabulário e campos acompanham o tipo de negócio em todas as telas

- **Dado** que minha loja está cadastrada como autopeça
- **Quando** percorro o cadastro de produto, a área de categorias, a vitrine, o carrinho, o pedido, o cupom impresso e a mensagem do WhatsApp
- **Então** em nenhuma delas aparece a palavra cardápio ou ingredientes: o catálogo é chamado de catálogo, os grupos de escolha são apresentados como especificações e compatibilidade, e os campos próprios do ramo aparecem (por exemplo marca, modelo e ano de aplicação)

#### AC-319 — Campo próprio do ramo é validado antes de salvar

- **Dado** um produto de loja de eletrônicos com campo de voltagem
- **Quando** informo um valor fora dos aceitos para aquele campo
- **Então** o formulário recusa o envio explicando o valor esperado, sem perder o resto do preenchimento

#### AC-320 — Trocar o tipo de negócio preserva o que já foi cadastrado

- **Dado** uma loja cadastrada como lanchonete com produtos que têm ingredientes
- **Quando** o administrador geral muda o tipo de negócio para restaurante
- **Então** nenhum produto perde dado, os grupos existentes continuam funcionando, e apenas o vocabulário e a disposição das telas mudam

#### AC-323 — Somente o administrador geral muda o tipo de negócio

- **Dado** que sou dono de loja
- **Quando** procuro alterar o tipo de negócio da minha loja, inclusive tentando enviar a alteração direto para a API
- **Então** a alteração é negada com explicação de que esse ajuste é feito pela administração da plataforma, e o tipo de negócio nem aparece como campo editável no meu painel

#### AC-324 — Layout se adapta ao escopo do negócio, não só as palavras

- **Dado** duas lojas, uma lanchonete e uma loja de roupas
- **Quando** comparo as telas de cadastro de produto, de detalhe do produto e da vitrine das duas
- **Então** cada uma exibe os campos e blocos que fazem sentido para o seu ramo, na ordem que faz sentido para o ramo, e oculta os que não se aplicam — por exemplo grade de tamanho e cor em destaque na loja de roupas, e ingredientes e adicionais em destaque na lanchonete

### US-305 — Dono controla disponibilidade sem apagar cadastro

Como dono de loja, quero marcar produto como esgotado, para que meu cliente não
peça o que eu não tenho e eu não precise excluir o cadastro.

#### AC-321 — Produto esgotado aparece sem poder ser comprado

- **Dado** um produto marcado como esgotado
- **Quando** o cliente o vê na vitrine
- **Então** ele aparece com selo de indisponível e o botão de adicionar não funciona, e voltar a marcar como disponível o libera na hora

#### AC-322 — Produto pode ficar disponível só em certos dias e horários

- **Dado** um produto que só vendo no fim de semana
- **Quando** um cliente abre a vitrine em uma terça-feira
- **Então** o produto não aparece como comprável, e no sábado ele volta a aparecer automaticamente, sem eu mexer em nada

### US-306 — Dono cria as especificações dentro de cada categoria

Como dono de loja, quero criar minhas categorias e, dentro de cada uma, criar as
especificações que os produtos dela têm, para que uma categoria de pneus peça aro
e largura, e uma de camisetas peça tamanho e malha, sem eu depender de ninguém.

#### AC-325 — Categoria tem seu próprio criador de especificações

- **Dado** que criei a categoria Pneus na minha autopeça
- **Quando** abro a categoria e uso o criador de especificações dela
- **Então** consigo criar especificações informando nome, tipo de valor (texto, número, lista de opções, verdadeiro ou falso), unidade quando fizer sentido, se é obrigatória e se serve para filtrar na vitrine

#### AC-326 — Produto herda as especificações da categoria dele

- **Dado** a categoria Pneus com as especificações Aro, Largura e Índice de carga criadas
- **Quando** cadastro um produto nessa categoria
- **Então** o formulário já apresenta essas três especificações para preencher, na ordem que defini, e as obrigatórias impedem salvar em branco

#### AC-327 — Especificação de lista só aceita os valores que eu cadastrei

- **Dado** a especificação Aro criada como lista com os valores 13, 14, 15 e 16
- **Quando** cadastro um produto e tento informar o valor 17
- **Então** o formulário recusa explicando quais valores existem, e eu consigo acrescentar o valor 17 à lista da especificação quando quiser

#### AC-328 — Especificação marcada para filtrar aparece como filtro na vitrine

- **Dado** a especificação Aro marcada como filtrável, com produtos preenchidos
- **Quando** o cliente abre a categoria Pneus na vitrine
- **Então** ele pode filtrar por Aro e vê apenas os produtos com o valor escolhido, e a especificação não marcada como filtrável não vira filtro

#### AC-329 — Produto que muda de categoria não perde o que foi preenchido

- **Dado** um produto na categoria Pneus com especificações preenchidas
- **Quando** eu o movo para outra categoria que tem especificações diferentes
- **Então** os valores anteriores são preservados e marcados como não usados na categoria atual, as especificações da categoria nova aparecem para preencher, e nada é apagado sem eu confirmar

#### AC-330 — Alterar ou remover especificação não corrompe produto nem pedido

- **Dado** uma especificação já preenchida em vinte produtos e presente em pedidos antigos
- **Quando** eu a renomeio ou a removo da categoria
- **Então** os produtos mantêm o valor com o histórico da mudança, os pedidos antigos continuam mostrando o que foi comprado com o nome da época, e o sistema me avisa quantos produtos serão afetados antes de confirmar

### US-307 — Dono controla estoque de peças e roupas

Como dono de autopeça ou de loja de roupas, quero controlar quantas unidades tenho
de cada variação, para que eu não venda o que não existe e saiba o que repor.

#### AC-331 — Estoque é contado por variação e baixado ao confirmar pedido

- **Dado** uma camiseta com tamanho M em estoque de dez unidades
- **Quando** um pedido com três unidades do tamanho M é confirmado
- **Então** o estoque do tamanho M passa a sete, o movimento fica registrado com data, motivo e pedido de origem, e os outros tamanhos não são afetados

#### AC-332 — Estoque zerado impede a venda daquela variação

- **Dado** o tamanho P com estoque zerado e controle de estoque ativo
- **Quando** o cliente tenta adicionar o tamanho P ao carrinho
- **Então** a variação aparece como indisponível e não é adicionada, e o total do carrinho não é afetado

#### AC-333 — Duas compras simultâneas não vendem a mesma última peça

- **Dado** uma variação com exatamente uma unidade em estoque
- **Quando** dois clientes confirmam o pedido dessa variação no mesmo instante
- **Então** apenas um pedido é aceito, o outro recebe aviso de que a peça acabou, e o estoque nunca fica negativo

#### AC-334 — Pedido cancelado devolve o estoque

- **Dado** um pedido confirmado que baixou três unidades do estoque
- **Quando** o dono cancela esse pedido
- **Então** as três unidades voltam ao estoque, o movimento de devolução fica registrado, e o histórico mostra os dois movimentos

#### AC-335 — Dono ajusta estoque manualmente com motivo registrado

- **Dado** que fiz a contagem física e encontrei diferença
- **Quando** ajusto a quantidade informando o motivo
- **Então** o estoque passa ao valor informado, o ajuste fica registrado com quem fez, quando e por quê, e a quantidade anterior permanece no histórico

#### AC-336 — Estoque baixo é sinalizado ao dono

- **Dado** uma variação com aviso de estoque mínimo configurado em cinco unidades
- **Quando** o estoque chega a cinco ou menos
- **Então** a variação aparece sinalizada na minha lista de produtos e existe uma visão do que está acabando, para eu repor

#### AC-337 — Loja de comida não é obrigada a controlar estoque

- **Dado** uma lanchonete cujo ramo não usa contagem de unidades
- **Quando** o dono cadastra produtos
- **Então** o controle de estoque vem desligado e ele trabalha apenas com disponível ou esgotado, sem campo de quantidade atrapalhando o cadastro

## Fora de escopo

- Importação de catálogo em planilha ou por integração com sistema externo.
- Preço por região, por canal de venda ou por cliente específico.
- Cupom de desconto e programa de fidelidade (existiam no primeiro SimpleClick
  como cupons, pontos e vantagem de aniversário) — ver Q-302.
- Combo ou kit que junta produtos diferentes em um item vendável.
- Tradução do catálogo para outros idiomas.

## Suposições

| ID      | Suposição                                                                                                                                                                                                                                                                                                                             | Status     | Resolução                                                                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| ASM-300 | Três preços nomeados por produto atendem a versão 1, e modelar preço como lista permite passar disso sem migração dolorosa                                                                                                                                                                                                            | aberta     | —                                                                                                                                             |
| ASM-301 | O mesmo mecanismo de grupo de escolha atende ingrediente e variação; a diferença é que variação pode ter estoque e código próprio, ingrediente não                                                                                                                                                                                    | aberta     | —                                                                                                                                             |
| ASM-302 | Os campos próprios de cada ramo ficam em estrutura flexível validada por esquema por tipo de negócio, em vez de uma tabela por ramo                                                                                                                                                                                                   | aberta     | —                                                                                                                                             |
| ASM-306 | O tipo de negócio é definido e alterado exclusivamente pelo administrador geral; o dono da loja nunca altera esse campo, apenas usufrui do vocabulário e do layout correspondentes                                                                                                                                                    | confirmada | Decidido pelo dono do produto em 17/08/2026                                                                                                   |
| ASM-307 | A adaptação por ramo vai além de trocar palavras: muda quais blocos e campos aparecem e em que ordem, em todas as telas onde produto é exibido ou editado                                                                                                                                                                             | confirmada | Decidido pelo dono do produto em 17/08/2026: "quando eu altero o tipo todo o layout se adapta conforme escopo do negócio"                     |
| ASM-308 | O criador de especificações pertence à categoria: o dono cria categorias e, dentro de cada uma, as especificações dos produtos daquela categoria — em vez de uma lista fixa de campos por ramo                                                                                                                                        | confirmada | Decidido pelo dono do produto em 17/08/2026: "cada campo deve ser feito um criador de categorias e dentro das categorias um criador de specs" |
| ASM-309 | O ramo define o padrão inicial das especificações sugeridas, mas o dono pode criar, alterar e remover as suas, porque só ele conhece o próprio catálogo                                                                                                                                                                               | aberta     | —                                                                                                                                             |
| ASM-310 | O controle de estoque é ligado por ramo: nasce ativo para roupas, autopeças e eletrônicos, e desligado para comida                                                                                                                                                                                                                    | confirmada | Decidido pelo dono do produto em 17/08/2026: "para autopeças e roupas quero controle de estoque"                                              |
| ASM-311 | A baixa de estoque acontece na confirmação do pedido, não na criação do carrinho, e a reserva é garantida por travamento no banco para não vender a mesma última peça duas vezes                                                                                                                                                      | aberta     | —                                                                                                                                             |
| ASM-303 | Cinco imagens por produto bastam. As imagens ficam no Cloudinary, que entrega cada uma no tamanho adequado ao dispositivo sem pipeline próprio; a cota gratuita é um pool único de 25 créditos por mês compartilhado entre transformação, armazenamento e tráfego, então o consumo precisa ser acompanhado desde a primeira loja real | confirmada | Decidido pelo dono do produto em 17/08/2026                                                                                                   |
| ASM-304 | O dono cadastra os produtos pelo celular na maior parte do tempo, então o formulário é desenhado mobile-first                                                                                                                                                                                                                         | aberta     | —                                                                                                                                             |
| ASM-305 | Categoria pertence a uma loja e não é compartilhada entre lojas, mesmo quando o nome coincide                                                                                                                                                                                                                                         | aberta     | —                                                                                                                                             |

## Perguntas em aberto

| ID    | Pergunta                                                                                                                                                                      | Status | Resposta |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-300 | Um produto pode estar em mais de uma categoria ao mesmo tempo (por exemplo em Promoções e em Lanches, como o primeiro SimpleClick sugeria)?                                   | aberta | —        |
| Q-301 | Quais tipos de negócio entram na versão 1 e quais campos próprios cada um tem? O primeiro SimpleClick listava lanchonete, restaurante, açaiteria, loja, eletrônicos e bebidas | aberta | —        |
| Q-302 | Cupom, programa de fidelidade, sistema de pontos e desconto de aniversário existiam no primeiro SimpleClick. Entram na versão 1 ou ficam para depois?                         | aberta | —        |
| Q-303 | O dono precisa de subcategoria (por exemplo Bebidas > Cervejas), ou um nível só é suficiente para começar?                                                                    | aberta | —        |
| Q-304 | Existe produto vendido por peso ou medida fracionada (por exemplo 500 g de açaí), ou tudo é vendido por unidade?                                                              | aberta | —        |
