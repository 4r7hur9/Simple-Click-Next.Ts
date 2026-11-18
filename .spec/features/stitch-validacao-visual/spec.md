# Spec: Validação visual, acessibilidade e regressão do redesign

> feature: stitch-validacao-visual
> status: rascunho

<!--
  Card #114 do RM Board. Bloco de códigos deste card: 11401 a 11499.
  Fase só de especificação (autorização de 06/11/2026): nada aqui está
  implementado nem aprovado. Cada critério diz o NÍVEL de prova que alcança:
  [declaração] = vitest lendo CSS, tokens ou manifesto (conta no onp-spec
  verify); [comportamento] = Playwright em navegador real (e2e, fora do
  verify, ver Q-11405); [manual] = revisão do dono ou simulador iOS,
  registrada no design.md. A estratégia e a matriz cruzada com os cards
  #104–#111 estão em design.md.
-->

## Contexto

O SimpleClick permite criar, personalizar e administrar lojas de diferentes
segmentos, publicar catálogo ou cardápio e receber pedidos. O redesign Stitch
(cards #104–#111) muda a aparência da experiência do cliente: início e
descoberta, vitrine, catálogo, produto, sacola, fechamento e área do cliente.
O dono do produto quer comprovar duas coisas antes de aceitar cada onda: que
cada tela respeita as referências, com toda diferença explicada, e que a
compra continua funcionando como hoje. Esta spec define como provar isso
(capturas, acessibilidade, estados, imagens, desempenho de catálogo grande e
regressão da jornada de compra) sem duplicar o que cada card já prova.
Universokar/autopeças nas referências é só exemplo visual; as provas usam
lojas de vários ramos.

## Histórias

### US-11401 — Cada tela comparada com a referência

Como dono do produto, quero ver cada tela redesenhada ao lado da referência,
em cada largura, com a lista de diferenças explicada, para aceitar o visual
sabendo o que mudou e por quê.

#### AC-11401 — Toda tela redesenhada tem captura em cada largura

- **Dado** a lista de telas da matriz (design.md, seção 4) e as larguras
  combinadas (Q-11401)
- **Quando** a rodada de capturas roda contra as lojas de exemplo
- **Então** existe uma captura de cada tela em cada largura e em cada tema
  combinado (Q-11404)
- **E** o manifesto da rodada aponta, para cada captura, a tela, a largura, o
  tema, a loja usada e a data [comportamento]

#### AC-11402 — Toda diferença em relação à referência tem classe e motivo

- **Dado** o manifesto de diferenças de uma tela
- **Quando** ele é conferido
- **Então** cada diferença tem uma classe: justificada, pendente ou regressão
- **E** toda justificada cita o motivo (princípio da constituição,
  acessibilidade, dado real da loja ou decisão registrada) e toda pendente
  cita uma pergunta em aberto existente
- **E** o teste prova só a forma do manifesto, não que ele está completo
  [declaração]

#### AC-11403 — O dono confere a lista e as telas sem referência

- **Dado** as capturas e o manifesto de uma onda, incluindo as telas que não
  têm mockup (detalhe do produto, acompanhamento do pedido, área do cliente)
- **Quando** o dono do produto revisa a rodada
- **Então** a revisão fica registrada com data, telas vistas e diferenças
  aceitas ou recusadas
- **E** as telas sem mockup são comparadas com a proposta visual do próprio
  card, e não com o Stitch [manual]

### US-11402 — A compra continua funcionando

Como dono do produto, quero que a jornada da descoberta até o pedido dê os
mesmos resultados depois do redesign, para que a mudança visual não custe
venda.

#### AC-11404 — A busca encontra os mesmos produtos

- **Dado** uma loja de teste com produtos conhecidos
- **Quando** o cliente busca um termo no catálogo e na descoberta
- **Então** aparecem os produtos esperados para esse termo, e só eles
- **E** a busca sem resultado mostra o estado vazio com uma saída
  [comportamento]

#### AC-11405 — Variações e adicionais mantêm escolha e preço

- **Dado** um produto com variação e com grupo de adicionais obrigatório
- **Quando** o cliente escolhe variação e adicionais
- **Então** o preço mostrado soma variação e acréscimos como hoje
- **E** sem a escolha obrigatória o produto não entra na sacola, com aviso
  [comportamento]

#### AC-11406 — A sacola guarda itens, quantidades e total

- **Dado** itens adicionados, um deles com preço de atacado
- **Quando** o cliente muda a quantidade, remove um item e recarrega a página
- **Então** itens, quantidades, desconto de atacado e total continuam certos
- **E** a sacola de uma sessão não aparece em outra [comportamento]

#### AC-11407 — Fechar o pedido gera o mesmo resultado

- **Dado** uma sacola com itens e um cliente com conta
- **Quando** ele fecha o pedido
- **Então** o pedido é criado com os mesmos itens e o mesmo total da sacola e
  ganha código
- **E** o acompanhamento do pedido abre e o envio pelo WhatsApp leva o texto
  pronto do pedido [comportamento]

#### AC-11408 — O que os testes antigos do fluxo afirmam continua verificado

- **Dado** a lista de testes de ponta a ponta antigos do fluxo de compra
  (design.md, seção 5)
- **Quando** o redesign de uma tela da lista é entregue
- **Então** cada comportamento que esses testes afirmam continua passando
- **E** ajuste de seletor é permitido, mas nenhuma asserção é removida,
  relaxada ou pulada [comportamento, fora do verify]

### US-11403 — Qualquer pessoa consegue usar as telas novas

Como cliente, inclusive quem usa teclado, leitor de tela, celular pequeno ou
prefere menos movimento, quero usar as telas novas sem barreira, para comprar
como qualquer pessoa.

#### AC-11409 — Nenhuma tela tem barreira séria de acessibilidade

- **Dado** cada tela da matriz em cada largura
- **Quando** a verificação automática de acessibilidade (axe, regras WCAG 2.2
  A e AA) roda no navegador com o contraste ativo
- **Então** não há violação de nível sério ou crítico
- **E** a lista mínima de regras do design.md foi de fato avaliada, para o
  teste não passar vazio [comportamento]

#### AC-11410 — Dá para comprar só com o teclado

- **Dado** a jornada da descoberta até a confirmação
- **Quando** o cliente usa só Tab, Shift+Tab, Enter, Espaço, setas e Esc
- **Então** alcança todos os controles na ordem visual, com o foco sempre
  visível
- **E** sacola lateral e janela do produto prendem o foco enquanto abertas,
  fecham com Esc e devolvem o foco a quem as abriu [comportamento]

#### AC-11411 — A cor de cada loja continua legível nas telas

- **Dado** a cor de destaque de cada loja de exemplo e o verde da marca
  #B7FF00
- **Quando** texto e ícones aparecem sobre essas cores nas telas
  redesenhadas
- **Então** a relação de contraste do texto é de pelo menos 4,5:1 e a dos
  ícones e bordas de pelo menos 3:1
- **E** o texto sobre o verde da marca é escuro [declaração e comportamento]

#### AC-11412 — Os alvos de toque têm o tamanho mínimo combinado

- **Dado** as telas do cliente nas larguras de celular
- **Quando** cada botão, link de ação e controle é medido
- **Então** nenhum é menor que o mínimo decidido na pergunta do #104 sobre
  toque (44 ou 48px), salvo link dentro de texto corrido
- **E** o teste antigo da vitrine, que mede 44px, continua valendo até a
  decisão [comportamento]

#### AC-11413 — Quem prefere menos movimento não vê animação grande

- **Dado** a preferência do sistema por movimento reduzido
- **Quando** as telas redesenhadas abrem, trocam de aba, abrem gaveta ou
  mostram aviso
- **Então** nenhuma animação de deslocamento, escala ou brilho passa de
  200ms nem se repete
- **E** cada animação nova das telas tem a regra de movimento reduzido
  declarada no CSS [declaração e comportamento]

#### AC-11414 — Barras fixas não ficam sob a área do sistema no celular

- **Dado** a barra de navegação inferior, a barra da sacola e qualquer botão
  fixo no rodapé da tela
- **Quando** a tela abre num iPhone com indicador de início
- **Então** o conteúdo da barra fica acima da área reservada pelo sistema
- **E** o CSS dessas barras declara a margem da área segura [declaração e
  manual]

#### AC-11415 — Nada estoura para o lado, nem com zoom

- **Dado** cada tela da matriz na menor largura suportada (344px) e o
  computador com zoom de 200%
- **Quando** a página termina de carregar
- **Então** não existe rolagem horizontal e nenhum texto, imagem ou botão
  passa da borda [comportamento]

### US-11404 — Estados e imagens nunca deixam a tela quebrada

Como cliente, quero entender o que acontece quando algo está vazio, falhou ou
ainda carrega, e ver imagens que não pulam nem somem, para confiar na loja.

#### AC-11416 — Vazio, erro e carregamento têm mensagem e saída

- **Dado** cada tela da matriz nos estados vazio (loja sem produto, busca sem
  resultado, sacola vazia, sem favoritos, sem pedidos), erro (falha da API,
  produto ou loja inexistente) e carregamento
- **Quando** o estado acontece
- **Então** a tela mostra uma mensagem clara e uma ação para seguir
- **E** o erro não expõe detalhe técnico e o carregamento é anunciado a quem
  usa leitor de tela [comportamento]

#### AC-11417 — Imagens têm substituto, espaço reservado e descrição

- **Dado** produtos e lojas sem foto, com foto quebrada e com foto normal
- **Quando** as telas redesenhadas carregam
- **Então** sem foto ou com foto quebrada aparece o substituto da loja ou do
  ramo, sem ícone de imagem quebrada
- **E** a moldura da foto é reservada antes de ela chegar (deslocamento de
  layout menor que 0,1), toda foto informativa tem texto alternativo e as
  fotos fora da primeira dobra carregam depois [comportamento]

### US-11405 — Catálogo grande continua rápido

Como cliente de uma loja com muitos produtos, quero que o catálogo abra e
responda rápido no celular, para não desistir da compra.

#### AC-11418 — O catálogo grande abre rápido e estável no celular

- **Dado** uma loja dedicada com o número de produtos combinado (Q-11407) e
  rede móvel emulada
- **Quando** o cliente abre o catálogo
- **Então** a mediana de várias aberturas mostra os primeiros produtos em
  menos de 2,5 s e o deslocamento de layout fica abaixo de 0,1
- **E** a página não desenha todos os produtos de uma vez (paginação, carga
  sob demanda ou virtualização) [comportamento]

#### AC-11419 — Busca e filtro respondem logo no catálogo grande

- **Dado** a mesma loja dedicada
- **Quando** o cliente digita na busca, troca de categoria ou aplica um
  filtro
- **Então** a lista reage em menos de 200 ms na mediana das medidas
- **E** os números são comparados só dentro da mesma máquina [comportamento]

### US-11406 — Pronto só com prova de verdade

Como dono do produto, quero que cada critério do redesign tenha prova
executada antes de a entrega ser dada como pronta, para não aceitar promessa.

#### AC-11420 — Cada critério da matriz tem prova executada

- **Dado** a matriz cruzada do design.md com os critérios dos cards
  #104–#111 e deste card
- **Quando** a entrega de uma onda é auditada
- **Então** cada critério tem prova executada, do nível que ele declara
- **E** teste pulado, pendente ou só escrito não conta como prova, e o
  critério sem prova aparece como pendente na matriz [manual sobre a saída
  do audit]

#### AC-11421 — Princípios e dados do Stitch conferidos em cada onda

- **Dado** uma onda do redesign entregue
- **Quando** a auditoria roda e as telas capturadas são lidas
- **Então** as buscas proibidas da constituição (verde do Stitch, recursos
  externos do export, termos automotivos) não encontram nada
- **E** o texto das telas não traz CNPJ, telefone, prazos, notas, "10x sem
  juros" nem cupom copiados do Stitch [declaração e comportamento]

## Fora de escopo

- Implementar código, criar testes, alterar banco, API, dependências ou a
  configuração do Playwright nesta fase.
- Provar de novo o que o #104 já prova nas peças: pares de contraste dos
  tokens, anel de foco, cor da loja nas peças, área segura da barra inferior
  e tema claro (ver design.md, seção 4).
- Painel do lojista e administração (#112, #113) até a decisão do dono sobre
  a onda 2.
- Funções "A decidir" (#115–#120, #123–#126) e qualquer função automotiva.
- Diferença pixel a pixel contra os PNGs do Stitch (ver ASM-11401).
- Commit, push, PR, merge, worktree ou troca de branch.

## Suposições

| ID        | Suposição                                                                                                                                         | Status | Resolução |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-11401 | Os PNGs do Stitch estão reduzidos e têm dados ilustrativos, então a comparação é lado a lado com lista de diferenças, não diferença pixel a pixel | aberta | —         |
| ASM-11402 | As ferramentas já instaladas bastam (Playwright, axe-core, cálculo de contraste do pacote de interface); nenhuma dependência nova                 | aberta | —         |
| ASM-11403 | A jornada usa a loja de teste do ponta a ponta; as capturas usam lojas da carga de exemplo; o catálogo grande usa loja própria criada pelo teste  | aberta | —         |
| ASM-11404 | Os testes de ponta a ponta antigos são a rede de regressão do fluxo, mas ficam invisíveis ao motor ONP por não terem o sufixo .onp                | aberta | —         |
| ASM-11405 | As specs de #105–#111 ainda estão sendo escritas; a matriz é atualizada a cada rodada e critério ausente fica como aguardando                     | aberta | —         |
| ASM-11406 | O resultado esperado da jornada vem de valores fixos da loja de teste, não de uma gravação do sistema antigo                                      | aberta | —         |
| ASM-11407 | O e2e combinado do critério de larguras do #104 pode morar na tarefa de acessibilidade deste card, se o #104 concordar                            | aberta | —         |

## Perguntas em aberto

| ID      | Pergunta                                                                                                                                                                                 | Status | Resposta |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-11401 | Quais larguras finais: A 344, 390, 768, 1024 e 1280 (proposta), B as mesmas e mais 1536, ou C só 344, 768 e 1280 (as do #104)?                                                           | aberta | —        |
| Q-11402 | Adotar comparação de pixels das telas novas (baseline)? A não na primeira onda (proposta), B sim num ambiente único com tolerância combinada, C sim em cada computador                   | aberta | —        |
| Q-11403 | Quais lojas de exemplo entram nas capturas? Proposta: lanchonete, roupas, mercadinho, farmácia e eletrônicos da carga de exemplo, mais a loja de teste                                   | aberta | —        |
| Q-11404 | Capturar só o tema escuro do redesign ou também o tema claro? (liga com a decisão de tema do #103 e com o tema claro do #104)                                                            | aberta | —        |
| Q-11405 | Como contar a prova de navegador na auditoria? A relatório do Playwright como evidência à parte (proposta), B pedir ao #103 um segundo comando no motor, C levar o essencial para vitest | aberta | —        |
| Q-11406 | Criar um projeto de celular com toque no Playwright (toque, tela de celular e talvez Safari) para medir toque real? A configuração não é deste card                                      | aberta | —        |
| Q-11407 | Quantos produtos tem o catálogo grande (1.000, 5.000 ou 10.000) e os limites 2,5 s, 0,1 e 200 ms valem?                                                                                  | aberta | —        |
| Q-11408 | Onde guardar as capturas: fora do git com só o manifesto versionado (proposta) ou dentro do repositório?                                                                                 | aberta | —        |
| Q-11409 | A conferência da área segura no simulador de iPhone, com captura registrada, vale como prova?                                                                                            | aberta | —        |
| Q-11410 | Ordem das ondas internas: A jornada de compra e acessibilidade primeiro, depois capturas, depois catálogo grande (proposta), ou outra?                                                   | aberta | —        |
| Q-11411 | O zoom de 200% no computador entra na prova de estouro lateral?                                                                                                                          | aberta | —        |
| Q-11412 | Painel do lojista e administração entram nesta validação quando a onda 2 for aprovada?                                                                                                   | aberta | —        |
