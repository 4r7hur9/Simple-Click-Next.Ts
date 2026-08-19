# Spec: Cardápio na TV da loja

> feature: cardapio-na-tv
> status: rascunho

<!--
  Como ler este arquivo (o formato é verificado por `onp-spec audit`):
  - US-xxx = história de usuário · AC-xxx = critério de aceite
    ASM-xxx = suposição · Q-xxx = pergunta em aberto
  - Toda história de usuário precisa de pelo menos um critério de aceite.
  - Todo critério de aceite precisa de Dado/Quando/Então completos.
  - Os códigos são únicos no projeto inteiro (nunca reutilize um número).
-->

## Contexto

A lanchonete tem uma televisão na parede. Hoje ela mostra um cardápio impresso
colado no vidro, ou uma imagem que alguém montou no editor de texto e nunca mais
atualizou — com preço riscado a caneta.

Esta feature transforma o catálogo que o dono já mantém numa tela de parede que
se atualiza sozinha. **Não é a vitrine numa tela grande.** Ninguém está rolando,
ninguém está com o celular na mão, e quem lê está a três metros de distância,
na fila, decidindo em quinze segundos. A tela avança sozinha, fica ligada o dia
inteiro, e precisa continuar de pé quando a internet da loja cair.

A distinção nasceu ao definir a régua de pontos de quebra: tratar a TV vertical
como um breakpoint da vitrine produziria uma vitrine estranha e um cardápio ruim
ao mesmo tempo.

## Histórias

### US-908 — Dono mostra o cardápio na TV da loja

Como dono de loja, quero exibir meu cardápio numa televisão da minha loja, para
que quem está na fila decida o pedido antes de chegar no balcão.

#### AC-925 — A TV mostra o cardápio sem ninguém operar

- **Dado** um endereço de exibição aberto numa televisão da loja
- **Quando** a tela fica ligada
- **Então** os produtos publicados avançam sozinhos em telas cheias, sem barra de rolagem, sem cursor e sem nada que precise de toque ou clique — porque ninguém vai até a parede operar a televisão

#### AC-926 — O texto é legível a três metros

- **Dado** a exibição rodando numa televisão comum
- **Quando** alguém olha da fila, a cerca de três metros
- **Então** nome e preço de cada produto aparecem em corpo grande o suficiente para leitura à distância, com contraste que passa na verificação automática, e no máximo o número de produtos por tela que cabe sem reduzir esse corpo

#### AC-927 — A tela se adapta à televisão, em pé ou deitada

- **Dado** televisões instaladas em pé e deitadas, de proporções diferentes
- **Quando** a exibição abre em cada uma
- **Então** o número de produtos por tela e a divisão do espaço acompanham a proporção da televisão, sem faixa preta nas bordas e sem produto cortado

#### AC-928 — Preço mudado no painel aparece na TV sem ninguém tocar nela

- **Dado** uma exibição no ar há horas
- **Quando** o dono altera preço, esgota um produto ou publica um novo
- **Então** a televisão passa a mostrar o catálogo atualizado dentro do prazo definido, sem alguém precisar reiniciar a televisão, abrir o endereço de novo ou apertar qualquer coisa

#### AC-929 — Internet caindo não apaga o cardápio

- **Dado** uma exibição no ar quando a internet da loja cai
- **Quando** a conexão fica indisponível por minutos
- **Então** a televisão continua mostrando o último cardápio que recebeu, em vez de tela de erro ou tela branca, e volta a atualizar sozinha quando a conexão retorna

#### AC-930 — Produto esgotado sai da TV, e não fica riscado

- **Dado** um produto marcado como indisponível pelo dono
- **Quando** a exibição avança
- **Então** aquele produto não aparece, porque cardápio de parede não tem como ser corrigido a caneta e mostrar o que acabou gera pedido que a cozinha vai recusar

## Suposições

- **ASM-030** — A televisão abre um navegador, por aparelho de TV, computador
  ligado a ela ou aparelho de streaming. Não haverá aplicativo nativo de
  televisão na primeira versão. _status: aberta_
- **ASM-031** — A exibição usa o mesmo catálogo público da vitrine, sem cadastro
  separado: o dono mantém um catálogo só. _status: aberta_
- **ASM-032** — O endereço de exibição é público e não pede login, porque
  ninguém vai digitar senha numa televisão com controle remoto. A proteção é o
  endereço ser difícil de adivinhar. _status: aberta_

## Perguntas em aberto

- **Q-034** — Quantos segundos cada tela fica antes de avançar? Muito rápido não
  dá tempo de ler; muito devagar faz a fila ver sempre a mesma coisa.
  _status: aberta_
- **Q-035** — A exibição mostra o cardápio inteiro em rodízio, ou só uma
  categoria escolhida pelo dono — para a loja poder ter uma TV de lanches e
  outra de bebidas? _status: aberta_
- **Q-036** — Entra código de leitura por câmera na tela, para a pessoa abrir o
  cardápio no próprio celular e já pedir? É a ponte entre a parede e o pedido, e
  muda o desenho da tela. _status: aberta_
