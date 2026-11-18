# Spec: Detalhe do produto, variações e adicionais (redesign Stitch)

> feature: stitch-detalhe-produto
> status: rascunho

<!--
  Card #109 do RM Board. Bloco de códigos deste card: 10901 a 10999.
  Só especificação: nada aqui está aprovado nem implementado. Os critérios
  descrevem o comportamento PROPOSTO para o dono do produto revisar; nenhuma
  pergunta foi respondida por palpite. O ZIP do Stitch NÃO tem tela de detalhe
  do produto: a composição é proposta própria (design.md) e a lacuna está na
  Q-10902. Universokar e autopeças são só exemplo visual (P-104, P-105).
-->

## Contexto

O SimpleClick permite criar, personalizar e administrar lojas de diferentes
segmentos. O cliente de qualquer loja precisa chegar ao detalhe de um produto,
conhecer o preço e escolher a configuração certa antes de colocá-lo na sacola:
tamanho e cor numa loja de roupas, sabor e adicionais numa lanchonete, volume
ou embalagem numa loja de bebidas, unidade ou caixa numa loja de material.

O detalhe **já existe e funciona**. Esta spec redesenha a apresentação com a
composição do Stitch (painel de decisão com preço, seletores e botão de
adicionar) e **preserva o comportamento atual**. Estado de hoje, com a
evidência (relatório de 06/11/2026; caminhos relativos a `apps/web/src/`):

- A rota `/loja/[slug]/produto/[id]` é o catálogo com a **janela do produto já
  aberta** (`app/(loja)/loja/[slug]/produto/[id]/page.tsx`, `PaginaDoProduto`).
  Tocar num cartão abre a mesma janela sem trocar de página
  (`features/produto/JanelaDoProduto.tsx`). Não existe página de detalhe separada.
- `features/produto/DetalheDoProduto.tsx` só desenha: tira de fotos
  (`produto.imagens`), seção, nome, chamada, preço, "Sobre o item" e o
  formulário `EscolhasDoProduto.tsx`, que concentra escolhas, validação, conta
  e envio ao carrinho.
- Variações em `MatrizDeVariacao.tsx` (a opção esgotada fica desabilitada e
  escrita como "Esgotado" ou "Indisponível") e adicionais em
  `SelecaoDeOpcoes.tsx` (a opção esgotada fica desabilitada como "Acabou").
- O atacado usa `unitarioNoAtacado` (`lib/atacado-na-vitrine.ts`) e
  `calcularItem` (`packages/core/src/item-total.ts`). `TabelaDoAtacado.tsx`
  marca a faixa que vale. **O total só aparece dentro do botão**
  (`BotaoAdicionar.tsx`); não há linha de preço por unidade vezes quantidade.
- **Vídeo**: o contrato já traz `midias` (fotos e vídeos, card #46) em
  `esquemaDoProduto` (`packages/contracts/src/vitrine.ts`), mas
  `prepararProduto` (`server/produto.ts`) só repassa `imagens`. O detalhe não
  mostra vídeo; só o feed mostra (`features/feed/MidiaDoPost.tsx`).
- **Por ramo**: a loja já entrega `blocos.detalheProduto`, uma lista de nomes de
  bloco por tipo de negócio (`packages/contracts/src/vertical.ts`;
  `fotos`, `descricao`, `grade`, `tabela_medidas`, `volume`, `ingredientes`,
  `adicionais`, `especificacoes`…). **O detalhe não lê essa lista.** Só o
  rótulo `variacao` do ramo chega à tela.
- **Especificações**: existem no banco (`AttributeDefinition`,
  `ProductAttribute`), mas só como filtro do catálogo. `esquemaDoProduto` não
  as traz, nem código do produto, nem estoque em unidades (só `disponivel`).
- Os testes legados (`apps/web/tests/produto-pagina.test.tsx`, marcados
  `@spec:` 410 a 414 e 313 a 317, da spec arquivada) cobrem escolha
  pendente, total ao vivo, esgotado e limite de opções. A janela
  (`JanelaDoProduto`, `eProdutoSimples`) e `DetalheDoProduto` não têm teste.

Fronteiras com outros cards (acordadas por mensagem no board):

- **#108** é dono do cartão do catálogo (preço, atacado, selo de esgotado, o
  convite a escolher). Tudo o que abre ao tocar no cartão é deste card.
- **#110** é dono da confirmação depois de adicionar e de toda a sacola. Este
  card termina no "Adicionar" e não muda o formato do item enviado.
- **#114** é dono dos testes transversais (axe, teclado em toda a jornada,
  imagens, regressão de preço com variação). Aqui, os critérios de
  acessibilidade da janela apontam para eles.

## Histórias

### US-10901 — Conhecer o produto antes de escolher

Como cliente, quero ver fotos e vídeo, o nome, o preço e o que o produto
oferece, para saber se é o que procuro sem sair da loja.

#### AC-10901 — A galeria mostra fotos e vídeos na ordem do dono

- **Dado** um produto com duas fotos e um vídeo cadastrados nessa ordem
- **Quando** o cliente abre o detalhe
- **Então** a galeria mostra as três mídias na ordem do dono, com a posição
  ("2 de 3") e a troca por arrastar, por setas e pelo teclado
- **E** cada foto tem texto alternativo e o vídeo tem nome acessível

#### AC-10902 — O vídeo só toca por ação do cliente

- **Dado** a galeria com um vídeo
- **Quando** o vídeo aparece na tela
- **Então** ele fica parado mostrando a capa, com o botão "Reproduzir vídeo"
- **E** o som só liga se o cliente pedir (Q-10906)

#### AC-10903 — Produto sem foto nem vídeo não quebra a tela

- **Dado** um produto sem nenhuma mídia
- **Quando** o cliente abre o detalhe
- **Então** a área da galeria mostra um espaço com a inicial do nome, do mesmo
  tamanho de uma foto, e o resto da tela não pula

#### AC-10904 — O cabeçalho mostra nome, preço e promoção sem ambiguidade

- **Dado** um produto com preço atual e preço anterior
- **Quando** o cliente abre o detalhe
- **Então** vê o nome, a seção e a chamada, o preço atual em destaque e o
  anterior riscado
- **E** um leitor de tela lê "De R$ X por R$ Y", e não dois números soltos

#### AC-10905 — O conteúdo acompanha o ramo da loja

- **Dado** três lojas de ramos diferentes (uma de roupas, uma lanchonete e uma
  de bebidas)
- **Quando** o cliente abre um produto de cada uma
- **Então** cada detalhe mostra só os blocos que o ramo prevê, na ordem do
  ramo: tamanho e tabela de medidas na de roupas, ingredientes e adicionais na
  lanchonete, volume na de bebidas
- **E** os rótulos usam as palavras do ramo ("Tamanho", "Sabor", "Volume")

#### AC-10906 — Bloco sem dado, desconhecido ou fora do escopo não aparece

- **Dado** um ramo com um bloco que o produto não tem, um bloco com nome
  desconhecido, ou os blocos `aplicacao` e `compatibilidade`
- **Quando** o cliente abre o detalhe
- **Então** nenhum desses blocos é desenhado, sem título vazio e sem erro
- **E** o SimpleClick nunca desenha informação de compatibilidade veicular,
  placa ou chassi (P-104)

#### AC-10907 — Ramo sem composição cadastrada mantém a tela de hoje

- **Dado** uma loja cujo ramo não tem lista de blocos do detalhe
- **Quando** o cliente abre um produto
- **Então** a tela mostra galeria, nome, preço, descrição e escolhas, como
  hoje, e nada some

### US-10902 — Escolher variação e adicionais com clareza

Como cliente, quero saber o que preciso escolher e ver o efeito de cada escolha
no preço, para adicionar o item certo sem surpresa.

#### AC-10908 — O que é obrigatório aparece marcado desde a abertura

- **Dado** um produto com um grupo obrigatório e um opcional
- **Quando** o cliente abre o detalhe
- **Então** cada grupo mostra a regra em palavras ("Escolha 1 · obrigatório",
  "Escolha até 3 · opcional")
- **E** nenhum aviso de erro aparece antes de o cliente tentar adicionar

#### AC-10909 — Adicionar sem escolher o obrigatório mostra o que falta

- **Dado** um produto com um grupo obrigatório ainda sem escolha
- **Quando** o cliente aciona "Adicionar à sacola"
- **Então** nada é adicionado e a tela diz o que falta, citando o nome do grupo
- **E** o grupo fica marcado, é levado à vista com o foco nele, e um leitor de
  tela anuncia a pendência

#### AC-10910 — Escolher a variação troca o preço e a tabela de atacado

- **Dado** um produto com variações de preços diferentes e faixas de atacado
  próprias
- **Quando** o cliente escolhe outra variação
- **Então** o preço do cabeçalho, a tabela de atacado e o total passam a ser os
  da variação escolhida

#### AC-10911 — Um adicional muda o total na hora, com o sinal do acréscimo

- **Dado** um produto de R$ 20,00 com um adicional de + R$ 3,00 e quantidade 2
- **Quando** o cliente marca o adicional
- **Então** o total passa para R$ 46,00 sem recarregar
- **E** cada adicional mostra o acréscimo com sinal ("+ R$ 3,00", "− R$ 2,00"),
  para não parecer o preço dele
- **E** ao desmarcar, o total volta ao valor anterior

#### AC-10912 — Ao chegar no limite de opções, as demais ficam bloqueadas

- **Dado** um grupo que aceita até três opções
- **Quando** o cliente marca a terceira
- **Então** as outras ficam desabilitadas e a tela anuncia o limite
- **E** ao desmarcar uma, elas voltam a poder ser escolhidas

#### AC-10913 — O convite a escolher usa uma só expressão no cartão e no detalhe

- **Dado** um produto que exige escolher variação ou grupo obrigatório
- **Quando** o cliente o vê no cartão do catálogo e depois no detalhe
- **Então** os dois usam a mesma expressão: "Escolher" mais o rótulo do ramo
  quando só a variação falta ("Escolher tamanho", "Escolher volume") e "Escolher
  opções" nos demais casos (texto sujeito à Q-10905)
- **E** o preço de um produto sem preço único mostra "A partir de" com o menor
  valor, ou o convite a escolher, e nunca um valor que muda sozinho

#### AC-10914 — A observação aparece só quando a loja a aceita

- **Dado** uma loja que aceita observação no item e outra que não aceita
- **Quando** o cliente abre um produto de cada uma
- **Então** o campo de observação só existe na primeira, com um exemplo do
  ramo, e tem limite de caracteres visível

### US-10903 — Quantidade, atacado e subtotal consistentes

Como cliente, quero ver o preço por unidade e o subtotal mudarem junto com a
quantidade, para saber quanto vou pagar antes de adicionar.

#### AC-10915 — Mudar a quantidade muda a faixa, o preço por unidade e o subtotal

- **Dado** uma variação escolhida com faixa de atacado a partir de 12 unidades
- **Quando** o cliente muda a quantidade de 11 para 12
- **Então** a faixa marcada na tabela passa a ser a de 12, o preço por unidade
  passa a ser o da faixa (com os adicionais somados) e o subtotal é esse preço
  vezes 12
- **E** o total do botão "Adicionar" é igual ao subtotal mostrado
- **E** os valores são os que a regra existente calcula (`unitarioNoAtacado` e
  `calcularItem`), sem regra comercial nova

#### AC-10916 — Voltar abaixo da faixa devolve o preço de varejo

- **Dado** a quantidade 12 com o atacado valendo
- **Quando** o cliente reduz para 11
- **Então** a faixa marcada volta a ser a do varejo, o preço por unidade volta
  ao de varejo e o subtotal e o botão acompanham

#### AC-10917 — Sem variação escolhida não há conta, há convite

- **Dado** um produto com variações e nenhuma escolhida
- **Quando** o cliente muda a quantidade
- **Então** a linha de subtotal não aparece e o cabeçalho mostra o convite a
  escolher, em vez de um valor que muda sozinho

#### AC-10918 — A quantidade tem limites claros e é anunciada

- **Dado** o seletor de quantidade
- **Quando** o cliente usa "−" e "+" ou digita
- **Então** a quantidade fica entre 1 e 99, os botões têm no mínimo 48 por
  48 px e a nova quantidade é anunciada a leitores de tela

#### AC-10919 — Preço ou cardápio que mudou é avisado e nada é adicionado

- **Dado** um produto que mudou de preço ou de estoque enquanto o cliente
  escolhia
- **Quando** ele aciona "Adicionar à sacola"
- **Então** a tela avisa que o cardápio mudou, mostra o valor atual e não
  adiciona o item com o valor antigo
- **E** o valor mostrado antes era apenas indicativo: o servidor recalcula
  (`totalVistoCentavos` é informativo)

### US-10904 — Saber o que não está disponível

Como cliente, quero perceber de imediato o que está esgotado ou fechado, para
não perder tempo escolhendo o que não posso comprar.

#### AC-10920 — Variação esgotada não é oferecida como disponível

- **Dado** um produto com a variação "M" esgotada e "P" e "G" disponíveis
- **Quando** o cliente vê o seletor de variações
- **Então** "M" aparece desabilitada com o texto "Esgotado" (a cor não é o
  único sinal) e não pode ser escolhida
- **E** "P" e "G" continuam escolhíveis

#### AC-10921 — Se a combinação escolhida está esgotada, comprar não é oferecido

- **Dado** que a variação escolhida, ou a padrão que abre marcada, está esgotada
- **Quando** o detalhe a mostra
- **Então** o botão fica desabilitado, a frase explica que essa opção acabou e
  o item não é adicionado (ASM-10906)

#### AC-10922 — Adicional esgotado fica visível e desabilitado

- **Dado** um grupo com um adicional esgotado e outros disponíveis
- **Quando** o cliente vê o grupo
- **Então** o esgotado aparece desabilitado com o texto "Acabou", e o produto
  continua à venda com os demais

#### AC-10923 — Produto esgotado, fora do horário ou loja fechada explica o motivo

- **Dado** um produto esgotado, fora do horário de venda, ou de uma loja
  fechada
- **Quando** o cliente abre o detalhe
- **Então** o botão fica desabilitado, o seletor de quantidade some e uma frase
  diz o motivo certo (acabou, fora do horário ou loja fechada)
- **E** loja fechada vence os outros motivos

#### AC-10924 — Nada de aviso de reposição nem estoque em unidades

- **Dado** qualquer produto esgotado
- **Quando** o cliente abre o detalhe
- **Então** não aparece "Avise-me", promessa de reposição, nem quantidade em
  estoque (P-107; essas funções são das specs "A decidir")

### US-10905 — Usar o detalhe no celular, no tablet e no computador

Como cliente, quero o detalhe confortável em qualquer tela e acessível pelo
teclado e por leitor de tela, para comprar do jeito que eu usar.

#### AC-10925 — No celular o detalhe é uma folha com o botão sempre à mão

- **Dado** uma tela de 390 px de largura
- **Quando** o cliente abre o detalhe e rola até o fim
- **Então** a folha ocupa a tela, a galeria vem primeiro e uma barra fixa com
  quantidade, total e "Adicionar à sacola" fica sempre visível
- **E** essa barra não cobre o último campo nem a área segura do aparelho

#### AC-10926 — No tablet e no computador a galeria e a decisão ficam lado a lado

- **Dado** uma tela de 768 px ou mais
- **Quando** o cliente abre o detalhe
- **Então** a galeria fica à esquerda e o painel de decisão (nome, preço,
  escolhas, quantidade e botão) à direita, na mesma janela

#### AC-10927 — Nada estoura em tela estreita nem com texto longo

- **Dado** uma tela de 344 px e um produto com nome longo, descrição longa e
  rótulo de variação grande
- **Quando** o cliente abre o detalhe
- **Então** os textos quebram e não existe rolagem horizontal

#### AC-10928 — Todo controle é alcançável, visível e fácil de tocar

- **Dado** o detalhe aberto
- **Quando** o cliente percorre tudo com o teclado
- **Então** cada controle (fechar, setas da galeria, variações, adicionais,
  quantidade, adicionar) recebe foco visível, tem alvo de pelo menos 48 por
  48 px e nome acessível (P-106)

#### AC-10929 — Esc fecha e o foco volta ao cartão de onde o cliente veio

- **Dado** o detalhe aberto a partir de um cartão do catálogo
- **Quando** o cliente aperta Esc ou aciona "Fechar"
- **Então** a janela fecha e o foco volta ao cartão (a prova transversal é do
  AC-11410 do #114; depende da Q-10408 do #104)

#### AC-10930 — Quem pede menos movimento não vê animação

- **Dado** um cliente com "reduzir movimento" ativado
- **Quando** o detalhe abre, a galeria troca de mídia ou a tela rola até uma
  pendência
- **Então** não há deslizes nem animações, só a troca direta

### US-10906 — Abrir, compartilhar e adicionar sem regressão

Como cliente, quero abrir o produto por um link, voltar ao catálogo onde
estava e adicionar do jeito de sempre, para que o redesign não quebre nada.

#### AC-10931 — O link direto abre o produto com o conteúdo já pronto

- **Dado** o endereço de um produto aberto do zero
- **Quando** a página é carregada
- **Então** o catálogo aparece com a janela do produto já aberta e o conteúdo
  (nome, preço, descrição, escolhas) vem pronto do servidor, visível a
  buscadores e sem script

#### AC-10932 — Fechar devolve o cliente ao catálogo no mesmo ponto

- **Dado** um produto aberto a partir do catálogo rolado
- **Quando** o cliente fecha o detalhe ou usa "voltar" do aparelho
- **Então** o catálogo reaparece na mesma posição e o endereço volta ao do
  catálogo

#### AC-10933 — A galeria nova não tira a prévia nem os dados estruturados

- **Dado** um produto com fotos e vídeo
- **Quando** o link é compartilhado ou lido por um buscador
- **Então** a prévia traz o nome e o preço e a foto principal, e os dados
  estruturados continuam listando as fotos do produto (`imagens`)

#### AC-10934 — O "+" do cartão só adiciona direto o produto simples

- **Dado** um cartão de produto simples (à venda, com preço, sem grupo
  obrigatório e com no máximo uma variação) e outro com escolha obrigatória
- **Quando** o cliente aciona o "+" de cada um
- **Então** o simples entra na sacola e o outro abre o detalhe, sem adivinhar
  a escolha pelo cliente

#### AC-10935 — Adicionar envia o item de sempre e a confirmação é uma só

- **Dado** um produto com variação, adicionais, quantidade e observação
  escolhidos
- **Quando** o cliente aciona "Adicionar à sacola"
- **Então** o item vai com os mesmos campos de hoje (produto, variação,
  escolhas, quantidade, observação e o total visto) e a sacola muda
- **E** a confirmação visível é uma só: a definida pelo #110 (AC-11006), sem um
  aviso a mais da janela

## Fora de escopo

- Escrever código, testes, estilos, contratos, API ou banco nesta etapa.
- Regra comercial nova: preço, atacado, estoque e validação seguem como estão.
- O cartão do catálogo e o convite a escolher dentro do cartão (#108); a
  sacola, a confirmação depois de adicionar e o fechamento (#110).
- Avise-me quando voltar ao estoque (#120), parcelamento e boleto (#126),
  avaliações e notas (#117), selos de loja (#118), cupons (#119), mais
  vendidos (#124): nenhuma tarefa daqui depende deles (P-107).
- Compatibilidade veicular, consulta de placa ou chassi, "garagem ativa": nada
  disso entra no SimpleClick (P-104). Autopeças são só um ramo como os outros.
- Mostrar atributos do produto, código ou quantidade em estoque: exigem
  contrato e API e dependem das perguntas Q-10904 e Q-10907.
- Copiar números, promessas, CNPJ, imagens ou textos do ZIP do Stitch (P-105).

## Suposições

| ID        | Suposição                                                                                                                                                                        | Status | Resolução |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-10901 | Nenhuma regra comercial nova: preço, atacado, estoque e validação seguem `unitarioNoAtacado`, `calcularItem` e o campo `disponivel` de hoje.                                     | aberta | —         |
| ASM-10902 | O vídeo do detalhe usa o campo `midias`, que o contrato já entrega; só o mapeamento da tela (`prepararProduto` e `ProdutoNaTela`) muda numa tarefa futura.                       | aberta | —         |
| ASM-10903 | A janela sobre o catálogo, com endereço compartilhável, continua até a resposta da Q-10901; o design propõe folha no celular e janela no computador sem trocar a rota.           | aberta | —         |
| ASM-10904 | A fronteira acordada com o #108 vale: o cartão é dele, tudo que abre ao tocar é deste card, e o −/+ no cartão (se aprovado) reusa `eProdutoSimples` sem alterá-la.               | aberta | —         |
| ASM-10905 | A fronteira acordada com o #110 vale: este card termina no "Adicionar", o formato do item não muda e a confirmação é do #110.                                                    | aberta | —         |
| ASM-10906 | Se a variação padrão estiver esgotada, o detalhe abre sem comprar liberado, ou na primeira variação disponível. O código atual ainda precisa ser conferido antes de implementar. | aberta | —         |
| ASM-10907 | As peças visuais comuns (Chip, AvisoFlutuante e a aparência da Gaveta) vêm do #104; este card não cria peça comum nem nome novo para elas.                                       | aberta | —         |
| ASM-10908 | Os produtos dos exemplos (roupa, lanche, bebida, ferragem, autopeça) são ilustrativos; nenhum dado do Stitch vira conteúdo real.                                                 | aberta | —         |

## Perguntas em aberto

| ID      | Pergunta                                                                                                                                      | Status | Resposta |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-10901 | Página própria, janela sobre o catálogo (como hoje) ou gaveta lateral no computador? O design propõe a janela.                                | aberta | —        |
| Q-10902 | A composição proposta no design.md, feita sem mockup do Stitch, pode ser a referência visual?                                                 | aberta | —        |
| Q-10903 | Qual a prioridade das especificações por segmento: que bloco vem primeiro em cada ramo?                                                       | aberta | —        |
| Q-10904 | Mostrar no detalhe os atributos já cadastrados do produto (hoje só filtros do catálogo)? Exige mudar contrato e API.                          | aberta | —        |
| Q-10905 | O convite a escolher deve ser "Escolher" mais o rótulo do ramo ou sempre "Escolher opções"?                                                   | aberta | —        |
| Q-10906 | O vídeo deve tocar mudo ao aparecer, como no feed, ou só quando o cliente tocar?                                                              | aberta | —        |
| Q-10907 | Mostrar código do produto e quantidade em estoque? Exige API, e a quantidade vira promessa para a loja.                                       | aberta | —        |
| Q-10908 | A linha "preço por unidade vezes quantidade igual subtotal" fica sempre visível ou só quando há atacado?                                      | aberta | —        |
| Q-10909 | O detalhe deve ter curtir, favoritar e compartilhar o produto? (As APIs de favorito e curtida de produto existem; hoje o detalhe não as usa.) | aberta | —        |
