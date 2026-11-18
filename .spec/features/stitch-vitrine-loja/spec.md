# Spec: Vitrine da loja — apresentação, atendimento e como comprar (redesign Stitch)

> feature: stitch-vitrine-loja
> status: rascunho

<!--
  Card #107 do RM Board. Bloco de códigos deste card: 10701 a 10799.
  Só especificação: nada aqui está aprovado para implementação. Os critérios
  descrevem o comportamento PROPOSTO para o dono do produto revisar; nenhuma
  resposta das perguntas foi presumida. Plano técnico em design.md.
  Critérios da spec arquivada (arquivo/spec/) são citados só pelo número
  ("critério legado 904"), para não colidir com os códigos deste bloco.
-->

## Contexto

O SimpleClick permite criar, personalizar e administrar lojas de diferentes
segmentos. A vitrine é a página pública de cada loja (`/loja/<apelido>`), que
o cliente abre pelo link que o dono compartilha. O Sobre continua tendo
endereço próprio (`/loja/<apelido>/sobre`).

As telas "Vitrine da loja" do Stitch (celular e computador) trazem capa com
degradê, selo de situação, logo, nome, descrição, botão de catálogo, cartões
de entrega, endereço e pagamento, abas (publicações, Sobre), carrossel de
destaques e contato por WhatsApp. Esta spec aproveita essa composição com os
**dados de cada loja**. Universokar e autopeças são só exemplo visual; números,
notas, prazos, "10x sem juros", CNPJ, endereços e imagens do mockup não são
copiados (P-105). Nada de placa, chassi, compatibilidade ou "técnico" (P-104).

O que já existe e precisa ser preservado está em design.md, seção 1:
apresentação com capa e cor da loja, selo aberto/fechado com contraste,
Sobre em janela com endereço próprio, publicações dos produtos, prévia real da
Aparência e a regra de nunca expor a chave PIX (critério legado 904).

Cabeçalho, navegação inferior e rodapé são do card #105 (stitch-navegacao-cliente);
peças visuais e tokens são do #104 (stitch-base-visual). Esta spec só trata o
conteúdo principal da página.

## Histórias

### US-10701 — Entender quem é a loja

Como cliente, quero ver logo de cara o nome, a marca e a cara da loja, para
saber que estou no lugar certo.

#### AC-10701 — A vitrine mostra a identidade da própria loja

- **Dado** uma loja com nome, logo, foto de fundo e cor de destaque cadastrados
- **Quando** o visitante abre a vitrine
- **Então** vê o nome da loja como título principal da página
- **E** vê a logo e a foto de fundo dessa loja, com a cor de destaque dela
- **E** a página não contém textos, números nem imagens do mockup do Stitch

#### AC-10702 — A identidade continua legível no celular e no computador

- **Dado** uma loja com cor própria, foto de fundo para computador e outra para celular
- **Quando** a vitrine é aberta numa tela estreita e numa tela larga
- **Então** a tela estreita usa a foto do celular e a larga usa a do computador
- **E** há um véu escuro entre a foto e o texto, e o texto sobre a cor verde da marca é escuro
- **E** o nome, a situação e o botão do catálogo estão todos na mesma tela de abertura, sem depender de rolagem (a prova visual por largura, o contraste e o estouro lateral em 344px são do card #114)

#### AC-10703 — Loja sem logo ou sem foto continua com cara própria

- **Dado** uma loja que não enviou logo nem foto de fundo
- **Quando** o visitante abre a vitrine
- **Então** vê as iniciais da loja no lugar da logo
- **E** vê a capa padrão do tipo de negócio da loja, sem imagem quebrada nem espaço vazio

### US-10702 — Saber quando a loja atende

Como cliente, quero saber se a loja está aberta e, se não estiver, quando
abre, para não pedir esperando um atendimento que não vai acontecer agora.

#### AC-10704 — Loja fechada mostra a situação e a próxima abertura

- **Dado** uma loja fechada agora, com próxima abertura informada
- **Quando** o visitante abre a vitrine
- **Então** vê "Fechada agora" e a próxima abertura, como a loja informou
- **E** a página não diz "Aberta agora" nem promete atendimento ou entrega imediata
- **E** o caminho para o catálogo continua disponível, com o aviso de que dá para ver e voltar depois

#### AC-10705 — Loja fechada sem horário não inventa horário

- **Dado** uma loja fechada que não informou a próxima abertura
- **Quando** o visitante abre a vitrine
- **Então** vê "Fechada agora" com "horário não informado"
- **E** nenhum horário aparece além dos que a loja cadastrou

#### AC-10706 — Fechamento excepcional mostra o motivo da loja

- **Dado** uma loja fechada por uma exceção com explicação cadastrada (por exemplo, um feriado)
- **Quando** o visitante abre a vitrine
- **Então** vê a explicação da exceção no lugar de "Fechada agora", seguida da próxima abertura

#### AC-10707 — Loja aberta diz isso em texto, não só em cor

- **Dado** uma loja aberta agora
- **Quando** o visitante abre a vitrine
- **Então** vê o texto "Aberta agora" no selo de situação
- **E** o selo mantém o contraste mínimo sobre a foto de fundo

### US-10703 — Saber como comprar

Como cliente, quero saber se a loja entrega, onde fica, como recebe o
pagamento e como falar com ela, para decidir se o pedido serve para mim.

#### AC-10708 — Só aparecem as condições que a loja configurou

- **Dado** uma loja sem endereço, sem forma de entrega ou sem formas de pagamento cadastradas
- **Quando** a vitrine é renderizada
- **Então** o cartão de cada informação ausente não aparece
- **E** não há cartão vazio, traço no lugar do dado nem dado de outra loja ou de demonstração
- **E** as informações que existem aparecem pelo nome ("Entrega", "Retirada no local", "Pix"), não pelo código interno

#### AC-10709 — A chave PIX nunca aparece na vitrine

- **Dado** uma loja cujo fechamento tem chave PIX cadastrada
- **Quando** a vitrine é renderizada com as formas de pagamento
- **Então** a página mostra "Pix" como forma de pagamento
- **E** a chave PIX não aparece em nenhum lugar do HTML da página

#### AC-10710 — WhatsApp só com número cadastrado e com texto neutro

- **Dado** uma loja com número público de WhatsApp cadastrado
- **Quando** o visitante abre a vitrine
- **Então** vê um link para falar com a loja no WhatsApp, com texto genérico (por exemplo, "Fale com a loja no WhatsApp")
- **E** o texto não fala em placa, chassi, técnico, prazo de resposta ou atendimento "agora", com a loja aberta ou fechada
- **E** uma loja sem número cadastrado não mostra nenhum botão nem link de WhatsApp

#### AC-10711 — O link do mapa só aparece com endereço que dá para achar

- **Dado** uma loja cujo endereço exibido tem rua ou cidade
- **Quando** o endereço aparece na página (a vitrine ou só o Sobre, conforme a Q-10706)
- **Então** há um link "Abrir no mapa" que procura esse endereço
- **E** um endereço sem rua e sem cidade aparece sem o link

#### AC-10720 — Sempre há um caminho para horários e informações

- **Dado** qualquer loja, com ou sem endereço, entrega, pagamento ou texto "Sobre"
- **Quando** o visitante abre a vitrine
- **Então** existe pelo menos um link de verdade para `/loja/<apelido>/sobre`
- **E** esse link funciona com JavaScript desligado

### US-10704 — Ir ao catálogo e ver os destaques

Como cliente, quero chegar ao catálogo com um toque e ver o que a loja
destaca, para começar o pedido rápido.

#### AC-10712 — O botão do catálogo usa a palavra do ramo e é um link

- **Dado** uma loja de um ramo cujo catálogo se chama "Cardápio" e outra cujo catálogo se chama "Catálogo"
- **Quando** cada vitrine é aberta
- **Então** o botão principal diz "Ver o cardápio" na primeira e "Ver o catálogo" na segunda
- **E** o botão é um link para `/loja/<apelido>/cardapio`, que funciona sem JavaScript

#### AC-10713 — Destaques aparecem só quando a loja tem destaques

- **Dado** uma loja sem nenhum produto marcado como destaque
- **Quando** a vitrine é renderizada
- **Então** a seção de destaques não aparece, nem com título vazio
- **E** quando a loja tem destaques, eles aparecem com nome, foto e preço da própria loja, seguindo a regra por ramo que a Q-10703 definir

### US-10705 — Ver publicações e conhecer a loja

Como cliente, quero ver as publicações da loja e a história dela sem me
perder, para conhecer a loja antes de pedir.

#### AC-10714 — As publicações da loja continuam na vitrine

- **Dado** uma loja com produtos à venda
- **Quando** o visitante abre a vitrine
- **Então** vê as publicações dos produtos, com curtir e comentar como hoje
- **E** uma loja sem produto à venda não mostra bloco de publicações vazio

#### AC-10715 — O Sobre continua com endereço próprio e conteúdo pronto

- **Dado** o endereço `/loja/<apelido>/sobre` aberto direto ou compartilhado
- **Quando** a página chega ao navegador
- **Então** o texto do Sobre, os horários e as formas de receber já vêm no HTML do servidor
- **E** o título e o endereço canônico são os do Sobre, distintos dos da vitrine

#### AC-10717 — Funções ainda não decididas ficam fora da vitrine

- **Dado** qualquer loja, de qualquer ramo
- **Quando** a vitrine é renderizada
- **Então** não aparecem nota, contagem de avaliações, selo de loja verificada ou certificada, "mais vendidos", parcelamento nem contador público de favoritos
- **E** não aparecem "NF-e inclusa" nem "compra protegida", que não têm base no produto

#### AC-10721 — Sem JavaScript, nenhum conteúdo some

- **Dado** a vitrine aberta com JavaScript desligado
- **Quando** a página termina de carregar
- **Então** o conteúdo e os links de todos os blocos (identidade, situação, condições, destaques, publicações e caminho para o Sobre) estão no HTML
- **E** nenhum bloco fica escondido atrás de uma aba que só abre por script

### US-10706 — O dono vê a vitrine de verdade enquanto personaliza

Como dono da loja, quero que a prévia da Aparência mostre a vitrine
exatamente como o cliente vai ver, para personalizar sem surpresa.

#### AC-10718 — A prévia é a mesma vitrine, com o rascunho por cima

- **Dado** um dono editando cor, fotos, nome, descrição ou logo na Aparência
- **Quando** abre a prévia da vitrine
- **Então** vê a mesma composição, com as mesmas folhas de estilo da página pública, já com o que está editando
- **E** a página pública, sem rascunho, continua igual ao que está salvo

#### AC-10719 — Favoritar a loja continua, sem contador público

- **Dado** uma loja com publicações e um cliente com conta
- **Quando** o cliente abre a vitrine
- **Então** consegue favoritar e desfavoritar a loja, vendo se ela já é favorita
- **E** a página não mostra quantas pessoas favoritaram a loja

## Fora do escopo

- Implementar código, alterar banco ou API, publicar conteúdo ou assumir custos.
- Avaliações (#117), selos de loja (#118), mais vendidos (#124) e parcelamento
  (#126): ficam ocultos até a decisão de cada card (P-107).
- Política de garantia e trocas como campo novo, contador público de
  favoritos e mapa embutido (com chave de API).
- Cabeçalho, navegação e rodapé (#105) e o topo do catálogo (#108).
- Funções de oficina, compatibilidade veicular, placa ou chassi (P-104,
  verificado pela constituição).
- Testes transversais, que são do #114 e não são duplicados aqui: teclado,
  axe por tela e largura, contraste da cor de cada loja, alvo de toque,
  movimento reduzido, estouro lateral em 344px, estados, imagens e dados do
  Stitch. O código AC-10716 (teclado) ficou sem uso de propósito, e as abas,
  se existirem, herdam o teclado da peça do #104.

## Suposições

| ID        | Suposição                                                                                                                                                                                                                                 | Status | Resolução |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-10701 | Cabeçalho, navegação inferior e rodapé vêm do #105; a vitrine só define o conteúdo principal                                                                                                                                              | aberta | —         |
| ASM-10702 | As peças novas (abas, chip, ícone de compartilhar, estrela de favoritar) e os tokens vêm do #104, com os nomes da nota do board; se mudarem, o design.md é ajustado                                                                       | aberta | —         |
| ASM-10703 | Nenhum campo novo de API ou banco: tudo vem da vitrine, do fechamento (sem a chave PIX) e do resumo do catálogo que a página já busca                                                                                                     | aberta | —         |
| ASM-10704 | A próxima abertura é mostrada exatamente como a API a manda, sem cálculo na tela                                                                                                                                                          | aberta | —         |
| ASM-10705 | O contato por WhatsApp usa texto genérico e não promete prazo de resposta                                                                                                                                                                 | aberta | —         |
| ASM-10706 | Toda folha de estilo usada pela vitrine carrega igual na página pública, no Sobre e na prévia; estilos novos vão em narrativa.css e sobre.css (que o layout da loja já carrega), não em vitrine.css                                       | aberta | —         |
| ASM-10707 | Testes antigos da vitrine que dependem da estrutura atual só mudam por tarefa explícita, com a equivalência declarada e sem enfraquecer o que provam                                                                                      | aberta | —         |
| ASM-10708 | Regras novas no estilo do feed ficam restritas à página da loja, sem mudar o /explorar do #106                                                                                                                                            | aberta | —         |
| ASM-10709 | Este card não altera o topo do catálogo (CapaDaVitrine): o #108 propôs ficar com ele (variante compacta) e com features/vitrine/*, server/catalogo-na-tela.ts e lib/catalogo.ts; aqui só se reusa Destaques e prepararProduto, sem editar | aberta | —         |

## Perguntas em aberto

| ID      | Pergunta                                                                                                                                                                                                              | Status | Resposta |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-10701 | Publicações, Sobre e destaques ficam em abas (como no Stitch) ou em seções empilhadas na mesma página? Abas trocadas por script escondem conteúdo sem JavaScript e do buscador; ver alternativas no design.md         | aberta | —        |
| Q-10702 | O Sobre continua como janela por cima da vitrine com endereço próprio (hoje), vira uma aba da vitrine ou vira uma seção no fim da página? Aba ou seção não podem criar um segundo endereço que dispute com o do Sobre | aberta | —        |
| Q-10703 | Os blocos da vitrine (destaques, publicações, condições) seguem a composição por tipo de negócio, que hoje só vale para o catálogo, ou aparecem para todo ramo sempre que houver dado?                                | aberta | —        |
| Q-10704 | O botão do catálogo mostra a quantidade real de itens à venda ("Ver o catálogo (32 itens)") ou só o texto?                                                                                                            | aberta | —        |
| Q-10705 | Criar o botão "Compartilhar a loja" (novo; usa o ícone de compartilhar do #104)? A tarefa só entra no tasks.md se a resposta for sim                                                                                  | aberta | —        |
| Q-10706 | O link "Abrir no mapa" aparece também no cartão de endereço da vitrine ou só no Sobre, como hoje?                                                                                                                     | aberta | —        |
| Q-10707 | O bloco "Garantia e trocas" do mockup é descartado ou vira um trecho do texto Sobre que o dono escreve? Um campo novo fica fora deste card                                                                            | aberta | —        |
| Q-10708 | O contato por WhatsApp fica na identidade, perto do nome (como no Stitch), num cartão próprio junto das condições ou nos dois?                                                                                        | aberta | —        |
| Q-10709 | Favoritar a loja deve aparecer junto da identidade, mesmo sem publicações (hoje só existe dentro das publicações)?                                                                                                    | aberta | —        |
| Q-10710 | Quem é dono, na implementação, de narrativa.css, sobre.css e selo-de-status.css, que não têm dono na tabela do #103? (pedido ao gerente; os destaques e a CapaDaVitrine ficam com o #108)                             | aberta | —        |
| Q-10711 | A descrição para buscadores diz "Peça em {loja} pelo WhatsApp" mesmo quando a loja não tem WhatsApp. Ajustar em outro card de SEO?                                                                                    | aberta | —        |
