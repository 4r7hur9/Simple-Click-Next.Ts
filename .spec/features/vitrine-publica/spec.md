# Spec: Vitrine Pública

> feature: vitrine-publica
> status: rascunho

## Contexto

É a única tela que o cliente final realmente vê — e a que decide se a loja vende
ou não. A vitrine é a mesma estrutura servindo três nomes conforme o ramo:
**cardápio** para quem vende comida, **catálogo** para quem vende peça ou
eletrônico, **vitrine** para quem vende roupa. Herda do primeiro SimpleClick a
página de boas-vindas da loja, o carrossel de destaques, a busca global, o filtro
por categoria e a página de detalhe do produto — agora renderizada no servidor
para carregar rápido no celular do cliente e ser encontrada no Google.

## Histórias

### US-400 — Cliente chega pela página da loja e entra na vitrine

Como cliente final, quero abrir o link que a loja divulgou e entender na hora
onde estou, para que eu decida pedir sem procurar nada.

#### AC-400 — Página da loja apresenta o negócio e leva à vitrine

- **Dado** que abro o endereço público de uma loja ativa
- **Quando** a página carrega
- **Então** vejo o nome da loja, a logo, a mensagem de boas-vindas que o dono escreveu, o tipo de negócio, se está aberta agora, e um caminho evidente para entrar na vitrine

#### AC-401 — Loja fechada avisa e deixa navegar

- **Dado** que abro a página de uma loja fora do horário de funcionamento
- **Quando** a página carrega
- **Então** vejo o aviso de que está fechada agora com o horário em que abre, consigo navegar pelo catálogo, e não consigo finalizar pedido enquanto estiver fechada

#### AC-402 — Loja suspensa ou inexistente responde com clareza

- **Dado** um endereço de loja que não existe ou que foi suspensa
- **Quando** tento abrir
- **Então** vejo página informando que a loja não está disponível, sem detalhe técnico e sem expor se o endereço já existiu

#### AC-403 — Página da loja é encontrada em busca e no compartilhamento

- **Dado** a página pública de uma loja ativa
- **Quando** o endereço é compartilhado em rede social ou lido por buscador
- **Então** o compartilhamento mostra nome, descrição e imagem da loja, e a página traz os dados estruturados de negócio e de menu que buscadores entendem

### US-401 — Cliente navega pelo catálogo por categoria

Como cliente final, quero ver os produtos organizados por categoria, para que eu
ache o que quero rapidamente.

#### AC-404 — Vitrine lista as categorias visíveis na ordem do dono

- **Dado** uma loja com categorias visíveis e ocultas
- **Quando** abro a vitrine
- **Então** vejo apenas as categorias visíveis, na ordem que o dono definiu, com seus produtos disponíveis, e as ocultas não aparecem de forma alguma

#### AC-405 — Filtrar por categoria mostra só aquela seção

- **Dado** que estou na vitrine com várias categorias
- **Quando** escolho a categoria Bebidas
- **Então** vejo apenas os produtos de Bebidas, o filtro em vigor fica visível, e consigo voltar para todas as categorias com um toque

#### AC-406 — Vitrine mostra destaques escolhidos pelo dono

- **Dado** uma loja com produtos marcados como destaque
- **Quando** abro a vitrine
- **Então** vejo os destaques em área própria no topo, navegável com o dedo no celular, e cada destaque leva ao produto correspondente

#### AC-407 — Vitrine de loja sem produto não parece quebrada

- **Dado** uma loja recém-criada sem nenhum produto publicado
- **Quando** abro a vitrine
- **Então** vejo mensagem explicando que a loja está montando o catálogo, em vez de tela vazia ou erro

### US-402 — Cliente busca um produto pelo nome

Como cliente final, quero digitar o que procuro, para que eu não precise rolar
a página inteira.

#### AC-408 — Busca encontra por nome e por descrição

- **Dado** uma loja com muitos produtos
- **Quando** digito parte do nome ou de palavra da descrição
- **Então** vejo os produtos correspondentes agrupados por categoria, a busca ignora diferença de acento e de maiúscula, e as categorias sem resultado desaparecem da lista

#### AC-409 — Busca sem resultado oferece saída

- **Dado** que busquei por algo que a loja não vende
- **Quando** nenhum produto corresponde
- **Então** vejo mensagem de nada encontrado com o termo que digitei e um caminho para limpar a busca e ver tudo de novo

### US-403 — Cliente abre o produto e monta o item do jeito que quer

Como cliente final, quero ver o produto em detalhe e escolher as opções, para que
eu peça exatamente o que desejo.

#### AC-410 — Página do produto mostra tudo que preciso decidir

- **Dado** um produto com imagens, descrição, preço e grupos de escolha
- **Quando** abro a página dele
- **Então** vejo as imagens, a descrição, o preço a pagar, os grupos de escolha com o que é obrigatório sinalizado, o campo de observação e o botão de adicionar com o total do item

#### AC-411 — Total do item acompanha as escolhas em tempo real

- **Dado** um produto de R$ 20,00 com adicional de R$ 3,00
- **Quando** marco o adicional e mudo a quantidade para dois
- **Então** o total exibido no botão passa a R$ 46,00 imediatamente, e o valor conferido no servidor ao adicionar é o mesmo

#### AC-412 — Escolha obrigatória pendente bloqueia com indicação clara

- **Dado** um produto com grupo obrigatório de escolha única
- **Quando** tento adicionar sem escolher
- **Então** a página não adiciona, rola até o grupo pendente e o marca visualmente, informando o que falta

#### AC-413 — Produto indisponível é visto mas não comprado

- **Dado** um produto marcado como esgotado ou fora do horário de venda
- **Quando** abro a página dele
- **Então** vejo o produto com o motivo da indisponibilidade e o botão de adicionar desabilitado com explicação

#### AC-414 — Endereço do produto pode ser compartilhado direto

- **Dado** a página de um produto
- **Quando** copio o endereço e abro em outro dispositivo
- **Então** chego direto naquele produto da loja certa, e o compartilhamento em rede social mostra a imagem, o nome e o preço do produto

### US-404 — Vitrine carrega rápido no celular do cliente

Como cliente final, quero que a página abra rápido mesmo na minha internet ruim,
para que eu não desista de pedir.

#### AC-415 — Vitrine é entregue pronta pelo servidor

- **Dado** um cliente abrindo a vitrine em conexão lenta
- **Quando** a página é solicitada
- **Então** o conteúdo do catálogo chega pronto do servidor, o conteúdo principal aparece em menos de dois segundos e meio em condição de rede móvel comum, e a página não depende de script para mostrar produto

#### AC-416 — Imagem de produto não desperdiça dado do cliente

- **Dado** produtos com imagens cadastradas
- **Quando** abro a vitrine no celular
- **Então** cada imagem chega em tamanho adequado à tela, sem baixar arquivo maior do que o necessário, e o espaço da imagem já está reservado para a página não pular enquanto carrega

#### AC-417 — Catálogo em cache serve rápido e atualiza logo após mudança

- **Dado** que a vitrine de uma loja está guardada em cache
- **Quando** o dono publica um produto novo ou muda um preço
- **Então** a vitrine passa a mostrar a mudança dentro do prazo definido de atualização, sem precisar de nova publicação manual

### US-405 — Vitrine é usável por todo mundo

Como cliente final que navega por teclado ou usa leitor de tela, quero conseguir
pedir sem depender do mouse, para que a loja também venda para mim.

#### AC-418 — Vitrine navega por teclado com foco visível

- **Dado** que estou na vitrine usando apenas o teclado
- **Quando** percorro categorias, produtos e o botão de adicionar
- **Então** todos são alcançáveis na ordem lógica, o elemento em foco é visualmente identificável, e o modal do carrinho devolve o foco para onde eu estava ao fechar

#### AC-419 — Vitrine passa na verificação automática de acessibilidade

- **Dado** as telas públicas de página da loja, vitrine e detalhe do produto
- **Quando** a verificação automática de acessibilidade é executada
- **Então** nenhuma violação de nível crítico ou sério é encontrada, incluindo contraste de texto, rótulo de imagem e rótulo de campo de formulário

#### AC-420 — Vitrine não estoura na horizontal em tela pequena

- **Dado** a vitrine aberta na menor largura de tela suportada
- **Quando** percorro a página inteira
- **Então** não existe rolagem horizontal, nenhuma imagem ou texto escapa do contêiner, e os botões têm área de toque confortável

## Fora de escopo

- Carrinho, checkout e envio do pedido: ficam na feature de pedido e checkout;
  aqui a vitrine apenas coloca o item no carrinho.
- Avaliação e comentário de cliente sobre produto ou loja.
- Lista de favoritos e histórico de navegação do cliente.
- Recomendação automática de produto por comportamento.
- Tema visual personalizável pelo dono além de logo, cor principal e banner —
  ver Q-400.
- Vitrine em outro idioma ou em outra moeda.

## Suposições

| ID      | Suposição                                                                                                                                  | Status | Resolução |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| ASM-400 | A vitrine é pública e anônima: o cliente navega e monta o carrinho sem login, e a conta só entra em jogo se ele quiser histórico           | aberta | —         |
| ASM-401 | O nome da vitrine muda conforme o ramo (cardápio, catálogo, vitrine), mas a estrutura e o código são os mesmos                             | aberta | —         |
| ASM-402 | A vitrine é gerada no servidor com cache por loja, e o prazo de um minuto de atualização é aceitável para o dono                           | aberta | —         |
| ASM-403 | A maior parte dos acessos vem de link do WhatsApp e do Instagram, em celular Android de tela pequena e rede móvel                          | aberta | —         |
| ASM-404 | O carrinho é guardado no navegador do cliente para sobreviver ao recarregar, e os preços são sempre reconferidos no servidor ao finalizar  | aberta | —         |
| ASM-405 | Uma loja tem catálogo pequeno na versão 1 (até algumas centenas de produtos), então a vitrine carrega por categoria sem paginação complexa | aberta | —         |

## Perguntas em aberto

| ID    | Pergunta                                                                                                                                  | Status | Resposta |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-400 | Quanto o dono pode personalizar a aparência da vitrine? Logo, cor principal e banner, ou também tipografia e disposição dos cartões?      | aberta | —        |
| Q-401 | A loja precisa de página institucional própria (o primeiro SimpleClick tinha uma tela "sobre"), ou a página de boas-vindas já cobre isso? | aberta | —        |
| Q-402 | A vitrine deve funcionar como aplicativo instalável no celular do cliente, com ícone na tela inicial e navegação offline do catálogo?     | aberta | —        |
| Q-403 | Produto em destaque é escolhido a dedo pelo dono ou calculado pelos mais vendidos?                                                        | aberta | —        |
