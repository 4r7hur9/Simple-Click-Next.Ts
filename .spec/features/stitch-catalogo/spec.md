# Spec: Catálogo responsivo com filtros e espaço para a sacola (redesign Stitch)

> feature: stitch-catalogo
> status: rascunho

<!--
  Card #108 do RM Board. Bloco de códigos deste card: 10801 a 10899.
  Redesign de recursos que JÁ EXISTEM: catálogo paginado, busca no servidor,
  categorias, filtros por especificação, atacado, ordenações e a sacola.
  Nada aqui está aprovado para implementação. Os critérios descrevem o
  comportamento PROPOSTO para o dono do produto revisar. Nenhuma resposta das
  perguntas foi presumida. Evidência do estado atual e plano técnico
  proposto em design.md.
-->

## Contexto

O SimpleClick permite criar, personalizar e administrar lojas de diferentes
segmentos, publicar catálogo ou cardápio e receber pedidos. O catálogo
público (`/loja/[slug]/cardapio`) é a tela onde o cliente da loja procura e
compara produtos. Ela serve a uma loja de roupas com 40 itens, a uma
lanchonete com cardápio curto e a uma distribuidora com milhares de produtos.

As telas de catálogo do Stitch (celular, tablet e computador) mostram uma
lista no celular, uma grade com categorias ao lado no tablet e, no
computador, filtros à esquerda, produtos no meio e a sacola à direita.
Universokar e autopeças são só exemplo visual (P-105): nada de busca por
código de fábrica, seletor de veículo, "garagem ativa" nem "compatível com"
(P-104). Uma loja de autopeças continua vendendo com o mesmo catálogo de
qualquer ramo.

O que o código já entrega e esta spec preserva (detalhes e evidência em
`design.md`): busca no servidor, páginas por cursor, categorias com total,
filtros por especificação, filtro e preço de atacado, quatro ordenações,
produto esgotado, "Ver mais" e a sacola. O que esta spec propõe é a
**apresentação**: lista no celular, grade no tablet e no computador, filtros
em gaveta ou barra lateral, estados claros e um espaço reservado para a
sacola. O conteúdo e a regra da sacola são do #110, o detalhe do produto é do
#109, a moldura e as barras globais são do #105 e a vitrine da loja é do #107. A `CapaDaVitrine.tsx` passa a ser do #108 (aceito pelo #107).

## Histórias

### US-10801 — Encontrar produtos num catálogo pequeno ou grande

Como cliente, quero encontrar produtos tanto numa loja com poucos itens
quanto numa com milhares, sem esperar tudo carregar, para comparar preços e
escolher rápido.

#### AC-10801 — Um catálogo grande abre em páginas, nunca inteiro

- **Dado** uma loja com milhares de produtos
- **Quando** o cliente abre o catálogo, e depois navega ou filtra
- **Então** a tela desenha no máximo uma página de cada vez (24 produtos por
  seção, até 72 na primeira tela) e informa quantos itens a seção tem no total
- **E** nenhuma interação pede ao servidor todos os produtos de uma vez
  (a página pedida respeita o máximo de 48 por requisição)
- **E** a prova em navegador numa loja grande é do #114 (critério "O catálogo grande abre rápido e estável no celular")

#### AC-10802 — "Ver mais" traz a próxima página sem repetir produtos

- **Dado** uma seção com mais produtos do que os mostrados
- **Quando** o cliente aciona "Ver mais" (ou chega ao fim, se a rolagem
  automática estiver ligada)
- **Então** os produtos da página seguinte entram abaixo dos atuais, sem
  repetir nenhum e sem recarregar a página
- **E** o botão indica quantos produtos ainda faltam e some quando a lista
  termina

#### AC-10803 — Um catálogo pequeno não mostra peças de catálogo grande

- **Dado** uma loja com poucos produtos e uma única categoria
- **Quando** o cliente abre o catálogo
- **Então** todos os produtos aparecem, sem botão "Ver mais"
- **E** a faixa de categorias não aparece quando há duas ou menos
- **E** a barra de busca continua disponível

#### AC-10804 — Busca, filtros e ordem valem no servidor e ficam no endereço

- **Dado** um cliente que busca "camiseta", marca um filtro e escolhe "Menor
  preço"
- **Quando** a página responde
- **Então** a lista vem filtrada e ordenada pelo servidor e o endereço guarda
  busca, categoria, filtros, atacado e ordem
- **E** copiar esse endereço e abri-lo em outro aparelho mostra o mesmo
  resultado
- **E** busca, filtros e ordem continuam funcionando com JavaScript
  desligado (links e formulários GET)

#### AC-10805 — Cada categoria mostra quantos itens tem

- **Dado** uma loja com três categorias e produtos em cada uma
- **Quando** o catálogo mostra a faixa de categorias (ou a lista lateral no
  computador)
- **Então** cada categoria aparece com o total de itens dela, vindo do total
  que o servidor já informa
- **E** a categoria escolhida é anunciada como a atual (`aria-current`)
- **E** com uma busca valendo, o número é o de acertos naquela categoria

### US-10802 — Ler o catálogo bem em qualquer tamanho de tela

Como cliente, quero que a lista se ajuste ao meu aparelho, para ler nome,
preço e condição sem ampliar a tela nem rolar para o lado.

#### AC-10806 — No celular, os produtos vêm em lista de uma coluna

- **Dado** uma tela de 344px de largura (proposta: Q-10801)
- **Quando** o cliente vê o catálogo
- **Então** cada produto ocupa uma linha com foto pequena à esquerda, nome,
  preço e condição à direita
- **E** a imagem carregada tem o tamanho de uma foto pequena, e não o de um
  cartão grande

#### AC-10807 — No tablet, os produtos vêm em grade de duas ou três colunas

- **Dado** uma tela de 768px de largura
- **Quando** o cliente vê o catálogo
- **Então** os produtos aparecem em grade de duas ou três colunas (Q-10801)
- **E** as categorias ficam ao lado, em coluna, ou numa faixa no topo (Q-10813)
- **E** a sacola continua numa barra fixa embaixo, se a pergunta Q-10803 for
  respondida assim

#### AC-10808 — No computador, o catálogo tem três zonas

- **Dado** uma tela de 1280px de largura (proposta: Q-10804)
- **Quando** o cliente vê o catálogo
- **Então** a página mostra filtros e categorias à esquerda, produtos no
  meio e uma zona reservada para a sacola à direita (região
  `.sc-catalogo__sacola`)
- **E** as zonas seguem a proporção 3, 6 e 3 de uma grade de 12 colunas
  (Stitch), e os produtos ocupam a zona da sacola quando ela não é mostrada
- **E** o conteúdo da zona da sacola é definido pelo #110 (pergunta "coluna fixa ou gaveta")

#### AC-10809 — A sacola aparecer ou sumir não faz a página pular

- **Dado** o catálogo no computador, com a sacola vazia e o cliente no meio
  da lista
- **Quando** ele adiciona o primeiro produto à sacola
- **Então** os produtos já visíveis não mudam de posição nem de largura
- **E** se a zona da sacola for liberada ou reservada quando vazia, isso
  segue o critério "Sacola vazia libera o espaço para os produtos" do #110 e é medido sem salto de layout (CLS)

#### AC-10810 — As barras fixas não cobrem o fim da lista

- **Dado** uma tela de 344px, com a barra do catálogo no topo e a barra da
  sacola embaixo (uma barra fixa por vez, conforme a pergunta do #105 sobre a
  prioridade das barras)
- **Quando** o cliente rola até o fim da lista
- **Então** o último produto e o botão "Ver mais" ficam visíveis acima da
  barra de baixo, com folga medida em CSS (`padding-bottom` da lista)
- **E** a barra do topo não cobre o título da seção ao rolar
- **E** a prova em navegador é do #114 (critério "Nada estoura para o lado") e do #110 (critério "A barra fixa não cobre o conteúdo nem outra barra")

#### AC-10811 — Nada do catálogo rola para o lado

- **Dado** o catálogo em 344, 768 e 1280px, com nomes longos e zoom de 200%
- **Quando** o cliente rola a página
- **Então** nenhum texto, preço, chip ou botão do catálogo força rolagem
  horizontal da página
- **E** a faixa de categorias pode rolar para o lado dentro dela, e todo chip
  continua alcançável pelo teclado (Tab)

### US-10803 — Filtrar e ordenar sem perder o lugar

Como cliente, quero refinar a lista por categoria, filtros e ordem, e
entender o que está ligado, para chegar ao produto certo e desfazer qualquer
filtro com um toque.

#### AC-10812 — No celular e no tablet, os filtros abrem numa gaveta

- **Dado** uma tela de até 1023px com uma categoria que tem filtros
- **Quando** o cliente aciona "Filtrar"
- **Então** abre uma gaveta (a que a barra do catálogo já usa, ou a Gaveta do
  #104) com os filtros, o atacado e a ordem
- **E** a gaveta mostra "Aplicar filtros" e "Limpar filtros", fecha com Esc e
  devolve o foco ao botão "Filtrar"

#### AC-10813 — No computador, os filtros ficam numa barra lateral

- **Dado** uma tela de 1280px com uma categoria que tem filtros
- **Quando** o cliente vê o catálogo
- **Então** os filtros e o atacado aparecem na barra lateral esquerda, sem
  precisar abrir painel
- **E** existe um só formulário de filtros por largura de tela (nenhum `id`
  repetido e nenhum campo duplicado para o leitor de tela)
- **E** o painel "Filtrar" da barra fica desligado nessa largura

#### AC-10814 — A barra lateral some quando a loja não tem filtros

- **Dado** uma loja ou categoria sem especificações cadastradas (o caso mais
  comum)
- **Quando** o cliente vê o catálogo no computador
- **Então** a barra lateral mostra só categorias, atacado e ordem, ou some e a
  grade se expande (Q-10802)
- **E** nunca aparece uma coluna vazia nem o título "Filtros" sem nada abaixo

#### AC-10815 — Os filtros ligados aparecem como chips que se removem

- **Dado** um cliente com busca "camiseta" e o filtro "Tamanho: M" ligados
- **Quando** ele olha o topo da lista
- **Então** vê um chip para cada filtro ligado, com o número de itens
  encontrados
- **E** acionar o "x" de um chip remove só aquele filtro e recarrega a lista
- **E** o chip tem nome acessível "Remover filtro Tamanho: M"

#### AC-10816 — As quatro ordenações de hoje continuam

- **Dado** o catálogo com a ordem "Relevância"
- **Quando** o cliente escolhe "Menor preço", "Maior preço" ou "A-Z"
- **Então** a lista é reordenada pelo servidor na ordem escolhida
- **E** com uma busca valendo, "Relevância" é a ordem dos acertos
- **E** nenhuma ordenação nova entra sem a decisão do dono (Q-10806)

#### AC-10817 — Trocar de categoria tem comportamento claro para os filtros

- **Dado** um cliente com o filtro "Tamanho: M" ligado na categoria
  "Camisetas"
- **Quando** ele troca para a categoria "Calças"
- **Então** a tela se comporta como hoje: os filtros de especificação são
  descartados, porque cada categoria tem os seus
- **E** a busca e o atacado continuam ligados
- **E** mudar esse comportamento é a pergunta Q-10812

### US-10804 — Comparar preços e entender a condição de cada produto

Como cliente, quero ver no cartão o preço, a condição de atacado e se preciso
escolher uma opção, para comparar sem abrir cada produto.

#### AC-10818 — O cartão mostra o preço e o preço anterior riscado

- **Dado** um produto com preço de R$ 49,90 e preço anterior de R$ 59,90
- **Quando** ele aparece na lista ou na grade
- **Então** o cartão mostra R$ 49,90 em destaque e R$ 59,90 riscado, com
  texto para leitor de tela ("de R$ 59,90 por R$ 49,90")
- **E** nenhum desconto, selo "Top" ou nota é inventado: só o que o cadastro
  traz

#### AC-10819 — O atacado aparece no cartão com a quantidade mínima

- **Dado** um produto com preço de atacado a partir de 12 unidades
- **Quando** ele aparece na lista
- **Então** o cartão mostra o preço de varejo e uma linha como "Atacado a
  partir de 12 un.: R$ 7,49", gerada por `chamadaDoAtacado`
- **E** um produto sem atacado não mostra essa linha
- **E** com o filtro "Atacado" ligado, só aparecem produtos com essa linha

#### AC-10820 — Quando é preciso escolher, o cartão diz isso sem inventar preço

- **Dado** um produto com variações ou opções obrigatórias, cujo preço
  depende da escolha
- **Quando** ele aparece na lista
- **Então** o cartão mostra o convite a escolher (hoje "Ver opções"; o texto novo, como "Escolher tamanho", é definido pelo #109) em vez de um preço
- **E** nenhum "a partir de" é inventado quando a loja não informa o menor
  preço
- **E** tocar no cartão ou no convite abre o detalhe do produto (é do
  #109), sem adicionar à sacola

#### AC-10821 — Esgotado e fora do horário são claros e sem número de estoque

- **Dado** um produto esgotado e um produto fora do horário de venda
- **Quando** eles aparecem na lista
- **Então** cada cartão traz o selo "Esgotado" ou "Fora do horário" em texto,
  e não só com cor ou opacidade
- **E** o botão de adicionar não aparece nesses cartões
- **E** o cartão não mostra quantidade em estoque (o dado não vem na vitrine;
  mostrar é a pergunta Q-10807)

#### AC-10822 — O "+" do cartão continua adicionando só produto simples

- **Dado** um produto simples e um produto com escolha obrigatória
- **Quando** o cliente aciona o "+" de cada um
- **Então** o produto simples entra na sacola e o produto com escolha
  obrigatória abre o detalhe (regra `eProdutoSimples`, do #109)
- **E** o cartão mantém os atributos `data-adicionar-produto` e
  `data-abre-produto` sem renomeá-los (contrato entre #108 e #109)
- **E** sem JavaScript, o cartão continua um link para o produto

### US-10805 — Saber o que aconteceu quando não há resultado

Como cliente, quero uma explicação clara e uma saída quando minha busca ou
filtro não encontra nada, ou quando algo falha, para não achar que a loja está
vazia nem ficar preso.

#### AC-10823 — Busca sem resultado informa o estado e oferece sair

- **Dado** um cliente que busca "zzzz" em qualquer largura (344, 768 ou 1280px)
- **Quando** a busca não encontra nada
- **Então** a tela diz "Nada encontrado para zzzz" e oferece um link para
  limpar a busca e os filtros (o texto exato é a pergunta Q-10811)
- **E** a barra de busca continua visível, com o termo preenchido
- **E** acionar o link volta ao catálogo inteiro, sem busca, categoria,
  filtros nem atacado

#### AC-10824 — Filtro sem acerto não diz que a loja está vazia

- **Dado** uma loja com produtos e um filtro de especificação sem nenhum acerto
- **Quando** o cliente liga esse filtro
- **Então** a tela diz que nenhum produto tem esse filtro e oferece "Limpar
  filtros"
- **E** a barra de filtros continua visível para desmarcar
- **E** a tela não mostra "O catálogo está sendo montado" nem "Essa categoria
  não existe mais" (hoje mostra: veja `design.md`)

#### AC-10825 — Categoria que não existe mais leva de volta ao catálogo

- **Dado** um endereço antigo com uma categoria renomeada ou apagada
- **Quando** o cliente o abre
- **Então** a página continua inteira (não é erro 404), diz que a categoria
  não existe mais e oferece "Ver o catálogo inteiro"
- **E** o catálogo inteiro continua listado logo abaixo

#### AC-10826 — Falha ao carregar mais não perde o que já aparece

- **Dado** uma lista com 24 produtos e a rede caiu
- **Quando** o cliente aciona "Ver mais" e a requisição falha
- **Então** os 24 produtos continuam na tela, e o botão mostra "Não deu para
  carregar. Tentar de novo"
- **E** a rolagem automática não repete a tentativa sozinha depois do erro
- **E** o aviso de erro é anunciado por leitor de tela (`aria-live`)

### US-10806 — O catálogo é da loja, não de um segmento

Como cliente de qualquer loja, quero ver o nome certo da seção e textos que
combinam com o ramo da loja, para entender a tela sem termos de outro negócio.

#### AC-10827 — O título usa o rótulo do ramo, nunca "Detalhes do Produto"

- **Dado** uma loja de comida (rótulo "Cardápio") e uma loja de roupas
  (rótulo "Catálogo")
- **Quando** o cliente abre a tela de catálogo de cada uma
- **Então** o título principal (h1) é o rótulo do ramo junto do nome da loja
  (por exemplo "Cardápio de Casa do Sabor")
- **E** o texto "Detalhes do Produto" não aparece em nenhuma tela do
  catálogo (ele só existe no mockup)

#### AC-10828 — O cardápio tem um topo curto com voltar, nome e status

- **Dado** o cardápio aberto a partir da vitrine
- **Quando** o cliente rola a lista
- **Então** o topo mostra um botão "Voltar à vitrine", o nome da loja e o
  selo "Aberta" ou "Fechada"
- **E** esse topo é uma variante compacta e opcional da `CapaDaVitrine` (agora do #108, aceito pelo #107); a capa da prévia da aparência e da apresentação da loja não muda
- **E** o selo traz texto, e não só cor

#### AC-10829 — Os textos servem a qualquer ramo e não copiam o exemplo

- **Dado** o texto de busca, os vazios, os filtros e as ajudas do catálogo
- **Quando** eles são lidos em qualquer loja
- **Então** nenhum texto fala de veículo, placa, chassi, "código OEM",
  compatibilidade, garantia, entrega em minutos, nota ou "pronta entrega" que
  o cadastro não informe
- **E** o campo de busca diz "Buscar produto" (ou o rótulo do ramo), e não
  "Buscar por modelo, ano ou código"
- **E** nenhuma imagem, nome de loja, contagem ou preço do Stitch aparece

### US-10807 — Nada do que funciona hoje quebra

Como dono de loja e como cliente, quero que o novo visual mantenha tudo o que
o catálogo já faz, para não perder pedidos por causa do redesign.

#### AC-10830 — O modo cardápio na TV e os testes atuais continuam passando

- **Dado** o catálogo redesenhado
- **Quando** a suíte de testes atual roda
- **Então** o modo cardápio na TV (`cardapio-na-tv*`) e os testes de busca,
  paginação, atacado, filtro e acessibilidade da vitrine continuam passando,
  sem teste enfraquecido
- **E** qualquer texto de teste que mude por decisão do dono (Q-10811) é
  atualizado de propósito e listado

#### AC-10831 — Banners de teste, dados estruturados, loja suspensa e cor da loja continuam

- **Dado** o catálogo redesenhado
- **Quando** ele é aberto
- **Então** `?banners=demo` só vale fora de produção
- **E** os dados estruturados da página só saem sem busca, filtro nem recorte
- **E** uma loja suspensa ou inexistente continua dando "não encontrada"
- **E** botão, chip ativo, aba ativa e anel de foco usam a cor de destaque da
  loja (`TemaDaMarca`), e não o verde da plataforma, e o texto sobre ela é
  legível

## Fora de escopo

- Implementar código, alterar banco ou API, publicar conteúdo ou assumir
  custos externos (esta etapa só especifica).
- O conteúdo e as regras da sacola, o fechamento e o WhatsApp: são do #110.
- O detalhe do produto (galeria, variações, opções, quantidade, regra de
  escolha obrigatória): é do #109.
- A moldura da loja, o topo global, a barra inferior e o rodapé: são do #105. A vitrine pública da loja, a apresentação e o Sobre: são do #107.
- Ler código de barras pela câmera (#123), mais vendidos e em alta (#124),
  "Avise-me quando chegar" e previsão de reposição (#120), avaliações e notas
  (#117), selos de loja verificada (#118), cupons (#119) e parcelamento
  (#126). São funções "A decidir"; nenhuma tarefa daqui depende delas (P-107).
- Busca por código de fábrica, seletor de veículo, "garagem ativa",
  "compatível com", garantias e "nota fiscal inclusa" do exemplo (P-104,
  P-105).
- Testes transversais de axe, teclado, toque, estouro lateral, imagens e
  catálogo grande em navegador: são do #114.

## Suposições

<!-- O que estamos ASSUMINDO sem confirmação. Status: aberta | confirmada | invalidada -->

| ID        | Suposição                                                                                                                                                                                                                                                                                                                  | Status | Resolução |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-10801 | A base do redesign não exige mudança de API nem de contrato: paginação, total por categoria, busca e ordenações já existem. Só filtros e ordenações novas mudariam (T-10808)                                                                                                                                               | aberta | —         |
| ASM-10802 | As peças Chip, Gaveta, Campo de busca e Cartão de vitrine vêm do #104 (ainda em rascunho). Se não forem aprovadas, valem as classes atuais, e o comportamento dos critérios não muda                                                                                                                                       | aberta | —         |
| ASM-10803 | Busca, categoria, filtros, atacado e ordem continuam no endereço, por links e formulários GET, e funcionam sem JavaScript                                                                                                                                                                                                  | aberta | —         |
| ASM-10804 | Larguras de referência: 344px (celular), 768px (tablet) e 1280px (computador), como no #104. O #114 propõe também 390 e 1024 (pergunta de larguras dele)                                                                                                                                                                   | aberta | —         |
| ASM-10805 | Nenhuma tarefa depende de função "A decidir" (#115 a #126); blocos delas ficam ocultos até a decisão (P-107)                                                                                                                                                                                                               | aberta | —         |
| ASM-10806 | O #108 é dono de `apps/web/src/features/vitrine/*` (inclusive `CapaDaVitrine.tsx` e `SeloDeStatus.tsx`, aceitos pelo #107), `apps/web/src/server/catalogo-na-tela.ts` e `apps/web/src/lib/catalogo.ts`, que a seção 7 do #103 não atribui. O #107 confirmou a capa; pedido de registro enviado ao gerente                  | aberta | —         |
| ASM-10807 | A zona da sacola, a coluna vazia e o fechamento da coluna seguem o #110 (critério "Sacola vazia libera o espaço" e perguntas sobre coluna fixa e sobre fechar a coluna). O empilhamento das barras fixas segue a pergunta de prioridade das barras do #105 (hipótese: uma barra por vez; a da sacola substitui a inferior) | aberta | —         |
| ASM-10808 | O #109 é dono de `lib/produto.ts`, `server/produto.ts` e `lib/atacado-na-vitrine.ts`; o #108 só consome `chamadaDoAtacado` e a regra `eProdutoSimples`                                                                                                                                                                     | aberta | —         |
| ASM-10809 | Nomes, contagens (1.086 itens), preços, prazos, estoques e imagens do Stitch são ilustrativos e não viram conteúdo (P-105). A cor da marca é só #B7FF00, e dentro da loja vale a cor dela (P-102)                                                                                                                          | aberta | —         |

## Perguntas em aberto

<!-- O que ainda não sabemos. Status: aberta | respondida. A decisão é do dono do produto. -->

| ID      | Pergunta                                                                                                                                                                                                                  | Status | Resposta |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-10801 | Qual a densidade da grade? No celular: lista de uma coluna (Stitch) ou grade de duas colunas (como hoje)? No tablet: duas ou três colunas? No computador: três ou quatro colunas por linha?                               | aberta | —        |
| Q-10802 | Quais filtros o cliente vê por ramo? Só os da categoria mais atacado (hoje), ou também "em estoque" e faixa de preço (isso exige contrato e API, T-10808)? E a lateral sem filtros mostra só categorias e ordem, ou some? | aberta | —        |
| Q-10803 | No tablet, a sacola fica numa barra fixa embaixo (como no Stitch) ou numa coluna lateral como no computador?                                                                                                              | aberta | —        |
| Q-10804 | A partir de que largura a página ganha as três zonas (com a coluna da sacola)? Proposta: 1280px. Alternativas: 1024px ou 1100px (onde a grade de hoje passa a ter quatro colunas)                                         | aberta | —        |
| Q-10805 | O cartão ganha os botões de quantidade (− e +) como no Stitch? Se sim, só para produto simples? Isso cruza com a regra do #109                                                                                            | aberta | —        |
| Q-10806 | Entram as ordenações "Maior desconto de atacado" e "Lançamentos" do Stitch? Hoje não existem no contrato e exigiriam mudança de API                                                                                       | aberta | —        |
| Q-10807 | O cliente deve ver a quantidade em estoque ("142 em estoque")? O dado não vem na vitrine, e mostrar é decisão comercial da loja                                                                                           | aberta | —        |
| Q-10808 | O tablet ganha abas da loja no topo (Vitrine, Categorias, Ofertas, Coleções) como no Stitch? "Ofertas" depende de preço anterior e "Coleções" seria os favoritos do cliente                                               | aberta | —        |
| Q-10809 | A ajuda "Dicas de busca" em sanfona (Stitch) entra? Se entrar, com texto genérico, sem "modelo e ano"                                                                                                                     | aberta | —        |
| Q-10810 | A lista usa o botão "Ver mais" ou a rolagem automática (que o código já tem) quando a página chega ao fim?                                                                                                                | aberta | —        |
| Q-10811 | O link de saída do vazio continua "Limpar a busca" (texto fixado em teste atual) ou passa a "Limpar busca e filtros"? Hoje o link já limpa tudo                                                                           | aberta | —        |
| Q-10812 | Ao trocar de categoria, os filtros de especificação continuam descartados (hoje) ou são mantidos quando a nova categoria também os tem?                                                                                   | aberta | —        |
| Q-10813 | No tablet e no computador, as categorias ficam numa lista lateral com contagem (Stitch) ou numa faixa de chips no topo (como hoje)?                                                                                       | aberta | —        |
