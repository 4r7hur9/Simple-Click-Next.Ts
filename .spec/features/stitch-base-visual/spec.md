# Spec: Base visual e componentes reutilizáveis do Stitch

> feature: stitch-base-visual
> status: rascunho

<!--
  Card #104 do RM Board. Bloco de códigos deste card: 10401 a 10499.
  Spec de ESPECIFICAÇÃO: nada implementado. Contrato das peças em design.md
  (seção 5) e regra de cor (seção 4). Testes futuros: *.onp.test.ts(x).
-->

## Contexto

O SimpleClick permite criar, personalizar e administrar lojas de qualquer
segmento. O redesign do Stitch ("Kinetic Retail Dark") traz superfícies
escuras, verde-limão, pílulas, chips, cartões e filtros. Esta feature define
a base visual comum: tokens (cor semântica, tipografia, espaço, raio,
elevação), foco, estados e as variantes de botão, campo, chip, cartão, abas,
gaveta, aviso flutuante e barra inferior. A base reaproveita as peças de
`packages/ui` e o catálogo `/ui`, conserva ✦ para curtir e ★ para favoritar,
a cor de destaque de cada loja, o contraste e a versão clara das áreas que a
usam. Os cards #105–#114 aplicam essas peças nas suas telas.

## Histórias

### US-10401 — Tokens da linguagem nova na fonte única

Como dono do produto, quero que cores, letras, espaços e curvas do redesign
venham de um lugar só, para que todas as telas pareçam do mesmo produto.

#### AC-10401 — Um verde só

- **Dado** o guia do Stitch com o verde #b2f800 e o primário branco
- **Quando** os papéis do guia são mapeados para os tokens do SimpleClick
- **Então** cada papel aponta para um token `--cor-*` existente ou para uma
  pergunta em aberto
- **E** o verde #b2f800 não aparece no site nem no pacote de interface
  (P-102)

#### AC-10402 — O tema escuro é o mesmo em todo lugar

- **Dado** os três blocos de tema escuro e claro da folha de tema
- **Quando** um valor de cor muda
- **Então** os três blocos e o espelho em TypeScript têm o mesmo valor
- **E** uma divergência reprova o teste

#### AC-10403 — Escala de letras com nome de uso

- **Dado** a escala tipográfica do redesign (títulos, texto, rótulo e preço)
- **Quando** uma tela precisa de um tamanho de letra
- **Então** ela encontra um token com nome de uso (por exemplo
  `--tipo-preco`) com tamanho, altura de linha, peso e espaçamento
- **E** nenhum texto fica abaixo de 12px

#### AC-10404 — Todo par de cor é legível

- **Dado** os pares de texto e fundo e de contorno e fundo do tema escuro
- **Quando** são medidos contra o fundo da página, a superfície dos cartões
  e o preto da vitrine
- **Então** todo texto alcança 4,5:1 e todo contorno de controle alcança 3:1
- **E** a divisória decorativa do Stitch não é usada como contorno de
  controle

### US-10402 — Ações reconhecíveis em qualquer tela

Como cliente, quero reconhecer curtir, favoritar e compartilhar pelo mesmo
símbolo em qualquer tela, para agir sem precisar ler.

#### AC-10405 — Curtir é sempre o brilho de quatro pontas

- **Dado** um botão de curtir em qualquer tela
- **Quando** o produto ainda não foi curtido e depois é curtido
- **Então** o símbolo é o brilho ✦ em contorno e depois preenchido
- **E** nunca aparece um coração

#### AC-10406 — Favoritar é sempre a estrela, e o estado é anunciado

- **Dado** um botão de favoritar ou de curtir
- **Quando** o cliente usa o botão
- **Então** o símbolo de favoritar é a estrela ★, em contorno ou preenchida
- **E** o leitor de tela ouve o nome da ação e se ela está marcada
  (`aria-pressed`)

#### AC-10407 — Compartilhar e demais ícones vêm do pacote

- **Dado** uma tela que precisa do ícone de compartilhar ou de outro ícone
- **Quando** ela desenha o ícone
- **Então** o ícone vem de `IconeCompartilhar` ou de outro export do pacote
  de ícones do projeto
- **E** nenhuma tela usa Material Symbols nem importa a biblioteca de ícones
  diretamente (P-103)

### US-10403 — Peças com estados coerentes no celular, tablet e computador

Como cliente, quero que botões, campos, filtros e janelas se comportem igual
em qualquer tela, para não ter que reaprender a cada página.

#### AC-10408 — Botão mostra cada estado

- **Dado** um botão principal, secundário, discreto ou de perigo
- **Quando** está em repouso, com foco, pressionado, desabilitado ou
  carregando
- **Então** cada estado tem aparência própria e o texto continua legível
- **E** o botão principal do cliente é pílula, verde com texto escuro, e
  carregando não aceita segundo clique

#### AC-10409 — Campo e busca mostram erro e foco

- **Dado** um campo de texto ou a busca
- **Quando** recebe foco, valor inválido ou fica desabilitado
- **Então** o rótulo continua presente para o leitor de tela, o erro aparece
  em texto ligado ao campo e o foco é visível
- **E** a área de toque tem a altura mínima definida para as telas do cliente

#### AC-10410 — Chip de filtro e de categoria

- **Dado** uma faixa de chips (filtro ou categoria)
- **Quando** o cliente ativa um chip pelo toque ou pelo teclado
- **Então** o chip ativo fica verde com texto escuro e é anunciado como
  marcado (filtro) ou atual (categoria)
- **E** todo chip da faixa é alcançado pelo Tab, mesmo sem barra de rolagem
  visível

#### AC-10411 — Abas trocam pelo teclado

- **Dado** um conjunto de abas (por exemplo Publicações e Sobre)
- **Quando** o cliente usa as setas, Home ou End
- **Então** a aba muda, o painel correspondente aparece e só a aba ativa
  recebe foco pelo Tab

#### AC-10412 — Gaveta prende e devolve o foco

- **Dado** um botão que abre uma gaveta (sacola, filtros, comentários)
- **Quando** a gaveta abre e o cliente aperta Esc ou o botão de fechar
- **Então** enquanto aberta o foco fica dentro dela e o resto da página não
  responde
- **E** ao fechar o foco volta ao botão que a abriu

#### AC-10413 — Aviso flutuante não atrapalha

- **Dado** uma confirmação curta (por exemplo "adicionado à sacola")
- **Quando** o aviso flutuante aparece
- **Então** o leitor de tela o anuncia sem que o foco saia do lugar
- **E** ele fica visível por pelo menos 5 segundos, pausa com o mouse ou o
  foco em cima e pode ser fechado

#### AC-10414 — Barra inferior mostra onde o cliente está

- **Dado** a barra de navegação inferior do celular
- **Quando** o cliente está numa das páginas da barra
- **Então** o item dela aparece ativo e é anunciado como página atual
- **E** todo item tem rótulo visível e a barra respeita a área segura do
  aparelho

### US-10404 — A cor de cada loja continua dela

Como dono de loja, quero que a minha cor de destaque apareça nos botões e
filtros da minha vitrine redesenhada, sem ficar ilegível.

#### AC-10415 — As peças seguem a cor da loja

- **Dado** uma loja com cor de destaque personalizada
- **Quando** a vitrine redesenhada é exibida
- **Então** botão principal, chip ativo, aba ativa e anel de foco usam a cor
  da loja, e não o verde do SimpleClick
- **E** as peças comuns do pacote não leem a cor de texto da marca da loja
  fora do envelope da loja

#### AC-10416 — Texto sobre a cor da loja é legível

- **Dado** cada amostra de cor oferecida ao dono e cores médias e escuras
  aceitas pelo seletor
- **Quando** a peça pinta texto sobre a cor ou a cor sobre o fundo preto
- **Então** o texto alcança 4,5:1 e a peça alcança 3:1
- **E** quando a cor não alcança, a versão ajustada é usada e o dono é
  avisado na aparência

### US-10405 — Navegar só pelo teclado

Como cliente que usa teclado, quero ver onde estou e operar cada controle,
para comprar sem mouse.

#### AC-10417 — O foco é sempre visível

- **Dado** qualquer controle das peças, no tema claro, no escuro ou dentro
  de uma loja
- **Quando** recebe foco pelo teclado
- **Então** aparece um anel com pelo menos 3:1 contra o fundo e separado da
  peça por um vão
- **E** a ordem do foco segue a ordem visual, sem `tabindex` positivo

### US-10406 — Catálogo visual das peças

Como agente ou pessoa que desenha as telas, quero ver cada peça em todos os
estados num lugar só, para usar a peça certa e notar regressões.

#### AC-10418 — O catálogo mostra cada peça nova

- **Dado** a página de catálogo `/ui`
- **Quando** ela é aberta
- **Então** chip, abas, gaveta, aviso flutuante, barra inferior, botão
  marcável e ícones aparecem em cada estado, nos temas disponíveis
- **E** os exemplos usam lojas de ramos variados, sem dados do Stitch

#### AC-10419 — Cabe no celular, no tablet e no computador

- **Dado** o catálogo nas larguras de 344, 768 e 1280px
- **Quando** é verificado num navegador real
- **Então** nenhuma peça cria rolagem lateral nem corta texto
- **E** a verificação de acessibilidade não acha violação séria e o
  movimento reduzido desliga pulsos e brilhos

### US-10407 — Tema claro preservado

Como dono de loja que usa o painel claro, quero que o redesign não mude as
minhas telas sem a decisão do dono do produto.

#### AC-10420 — O tema claro não muda

- **Dado** as áreas que usam o tema claro (painel, administração, conta, o
  envelope claro da loja e a landing)
- **Quando** os tokens do redesign entram
- **Então** o tema claro da raiz e do trecho claro mantêm exatamente os
  valores atuais do espelho claro

## Fora de escopo

- Implementar código, criar testes, alterar banco, API ou dependências.
- Compor cartão de produto e de loja e aplicar as peças nas telas (#105–#111).
- Painel e administração (#112, #113); validação visual transversal (#114).
- Funções "A decidir" (#115–#120, #123–#126); nada automotivo (P-104).
- Mudar `stories.css` além do que os tokens mudam de valor.
- Commit, push, PR, merge, worktree ou troca de branch.

## Suposições

| ID        | Suposição                                                                                                                               | Status | Resolução |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-10401 | Funções e APIs atuais das peças são preservadas; toda prop nova é opcional                                                              | aberta | —         |
| ASM-10402 | A fonte, qualquer que seja, entra por next/font e é servida do próprio domínio (baixada no build), o que não conta como recurso externo | aberta | —         |
| ASM-10403 | As peças novas nascem no pacote de interface; aplicá-las nas telas e migrar as classes de cada tela é dos cards donos                   | aberta | —         |
| ASM-10404 | Larguras, contraste renderizado, axe e movimento reduzido precisam de navegador e ficam num e2e combinado com o #114; o resto é vitest  | aberta | —         |
| ASM-10405 | O brilho do CTA e o pulso do curtir, se adotados, são decorativos e somem com movimento reduzido                                        | aberta | —         |
| ASM-10406 | Categorias da vitrine são navegação (chips com link), não abas; abas servem para alternar painéis na mesma página                       | aberta | —         |

## Perguntas em aberto

| ID      | Pergunta                                                                                                                                           | Status | Resposta |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-10401 | Qual tipografia: A Plus Jakarta Sans em tudo, B Space Grotesk e Inter (atual) ou C Jakarta só nas telas do cliente? (liga com Q-10302)             | aberta | —        |
| Q-10402 | O tema escuro do redesign vale só para a experiência do cliente ou também para conta, painel e administração? (liga com Q-10304)                   | aberta | —        |
| Q-10403 | Quando celular e computador do Stitch divergem (brilhos, raios, cores), qual tela é a referência canônica?                                         | aberta | —        |
| Q-10404 | Superfície 2, tinta média, divisória e verde de sucesso usam os valores do guia do Stitch ou continuam os atuais? (design.md seção 3)              | aberta | —        |
| Q-10405 | A área mínima de toque sobe de 44 para 48px no site todo ou só nas telas do cliente (token novo)?                                                  | aberta | —        |
| Q-10406 | Adotar o brilho verde nos botões principais e o pulso ao curtir?                                                                                   | aberta | —        |
| Q-10407 | A estrela de favorito preenchida é amarela, branca ou da cor do texto?                                                                             | aberta | —        |
| Q-10408 | O Dialogo do pacote, que hoje não é modal de verdade (não fecha com Esc nem devolve o foco), deve ser corrigido nesta feature ou num card próprio? | aberta | —        |
