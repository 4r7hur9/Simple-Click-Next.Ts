# Spec: Mais vendidos, em alta e recomendações públicas

> feature: decidir-mais-vendidos
> status: rascunho

<!--
  Card #124 do RM Board. Bloco de códigos deste card: 12401 a 12499.
  Função "A decidir" (P-107): nada daqui é decisão aprovada nem está
  autorizado a ser implementado. Todas as suposições e perguntas estão
  abertas de propósito. Exemplos de produto, números e nomes abaixo são
  neutros (P-105); nada vem do Stitch como conteúdo real.
-->

## Contexto

O SimpleClick permite criar, personalizar e administrar lojas de vários
segmentos. Os mockups do Stitch mostram selos "Mais vendido" e "Em alta", uma
aba "Mais vendidos" na vitrine e um filtro "Mais vendidos" no feed. Hoje o
SimpleClick tem um ranking de mais vendidos só no painel do dono (métricas), e
ele traz faturamento. O catálogo público e o feed não ordenam nem destacam por
vendas: o catálogo ordena por relevância (a ordem manual do dono), preço e A–Z;
o feed, por relevância, distância, preço e recentes.

Esta spec descreve, para o dono do produto decidir, um ranking **público**,
separado da curadoria manual ("Destaque da loja") e de qualquer recomendação
personalizada. A evidência do estado atual e as alternativas técnicas estão em
design.md.

## Histórias

### US-12401 — Entender por que um produto está em destaque

Como cliente, quero entender por que um produto aparece como destaque, para
confiar no selo e saber se é escolha da loja ou resultado de vendas.

#### AC-12401 — O selo de mais vendido segue o critério e o período aprovados

- **Dado** um produto que a regra aprovada coloca entre os mais vendidos da loja
- **Quando** o cliente consulta a lista de produtos da loja
- **Então** o produto mostra o selo "Mais vendido" e a legenda informa o período
  aprovado
- **E** um produto que a regra não escolheu não mostra o selo

#### AC-12402 — "Destaque da loja" é diferente de "Mais vendido"

- **Dado** um produto marcado como destaque pelo dono e fora do ranking de vendas
- **Quando** o cliente vê o produto na vitrine
- **Então** ele mostra o selo "Destaque da loja" e não mostra "Mais vendido"
- **E** a legenda do selo diz que é uma escolha da loja

### US-12402 — Lista "Mais vendidos" que segue a regra aprovada

Como cliente, quero uma lista de mais vendidos da loja que siga sempre a mesma
regra, para comparar produtos sem surpresa.

#### AC-12403 — Só vendas válidas entram na conta

- **Dado** pedidos cancelados, pedidos pendentes e pedidos aguardando a
  confirmação do WhatsApp de um produto
- **Quando** o ranking da loja é calculado
- **Então** esses pedidos não contam
- **E** um pedido do WhatsApp passa a contar só depois que a loja o aceita
  (mesma regra de venda das métricas do painel)

#### AC-12404 — O desempate é sempre o mesmo

- **Dado** dois produtos com o mesmo resultado no critério aprovado
- **Quando** o ranking é calculado duas vezes seguidas sem pedido novo
- **Então** a ordem dos dois é idêntica nas duas respostas
- **E** a regra de desempate aprovada decide quem fica na frente

#### AC-12405 — Cada produto aparece uma única vez, com o nome de hoje

- **Dado** um produto que foi renomeado, tem variações e já saiu em pedidos
- **Quando** o ranking é calculado
- **Então** ele aparece em uma só posição, somando suas variações
- **E** mostra o nome atual do catálogo, não o nome gravado no pedido
- **E** itens de pedido sem produto não entram

#### AC-12406 — Vendas de outra loja não influenciam

- **Dado** duas lojas que vendem produtos parecidos
- **Quando** o ranking da primeira loja é calculado
- **Então** só pedidos da própria loja entram na conta
- **E** a função de banco filtra a loja por dentro, sem depender só da política
  de acesso

### US-12403 — Sem dados suficientes, sem ranking inventado

Como cliente, quero que a loja só mostre "mais vendidos" quando houver vendas
de verdade, para não ser enganado por uma lista fabricada.

#### AC-12407 — Abaixo do mínimo, nada de ranking

- **Dado** uma loja com menos produtos acima do mínimo aprovado de pedidos
  distintos no período
- **Quando** o cliente abre a vitrine
- **Então** a seção, a aba e o selo de mais vendidos não aparecem
- **E** a lista não é completada com destaques da loja nem com produtos sem venda

#### AC-12408 — Desligado, abaixo do mínimo e loja inexistente respondem igual

- **Dado** uma loja com o ranking desligado, outra abaixo do mínimo e um apelido
  de loja que não existe ou está suspensa
- **Quando** cada uma é consultada na rota pública do ranking
- **Então** as três respostas têm o mesmo status e o mesmo corpo vazio
- **E** ninguém consegue descobrir, por essa rota, se a loja existe ou vende pouco

### US-12404 — O ranking público não expõe dados internos

Como dono da loja, quero que o ranking público não revele meu faturamento nem
meus clientes, para proteger o meu negócio.

#### AC-12409 — A resposta pública não traz números nem dados de clientes

- **Dado** o ranking público de uma loja com vendas
- **Quando** a resposta da rota é inspecionada
- **Então** cada item traz só o identificador do produto e a posição
- **E** não há faturamento, quantidade vendida, contagem de pedidos, nem dado de
  cliente
- **E** o esquema da resposta rejeita qualquer campo a mais

#### AC-12410 — A rota não aceita parâmetros que mudem a conta

- **Dado** uma consulta à rota pública do ranking com período, limite ou limiar
  na URL
- **Quando** a API recebe o pedido
- **Então** ela recusa a consulta
- **E** período, tamanho da lista e mínimo ficam fixos no servidor, para ninguém
  inferir vendas diárias comparando janelas

#### AC-12411 — Só produto publicado de loja ativa aparece

- **Dado** um produto em rascunho, um produto apagado e um produto de loja
  suspensa ou excluída, todos com muitas vendas
- **Quando** o ranking é consultado
- **Então** nenhum deles aparece
- **E** na vitrine da loja vale "loja ativa, não excluída e com o ranking ligado";
  no feed da plataforma soma-se a loja visível no feed e o produto publicado no feed

#### AC-12412 — A função de banco é endurecida

- **Dado** a função de banco que calcula o ranking
- **Quando** a migração é revisada
- **Então** ela fixa o caminho de busca (`search_path = app, pg_temp`)
- **E** pertence ao dono de migração, sem acesso para o público (`REVOKE ALL FROM
PUBLIC`) e com `GRANT EXECUTE` só ao papel da aplicação
- **E** passa na guarda do projeto para funções com privilégio elevado (G10)

### US-12405 — O dono controla o ranking da própria loja

Como dono da loja, quero ligar e desligar o ranking público de mais vendidos,
para decidir se meus clientes veem essa informação.

#### AC-12413 — Só o dono liga ou desliga

- **Dado** uma loja com a opção de ranking e uma pessoa da equipe sem ser dono
- **Quando** ela tenta mudar a opção
- **Então** a mudança é recusada
- **E** quando o dono muda, o painel confirma o novo estado

#### AC-12414 — Desligar tira o ranking de circulação

- **Dado** uma loja que tinha o ranking ligado
- **Quando** o dono desliga a opção, despublica um produto do ranking ou a loja é
  suspensa
- **Então** a vitrine deixa de mostrar o ranking em até o tempo máximo de cache
  aprovado
- **E** o cache da loja é invalidado e o site é avisado para renovar o dele
- **E** a chave de cache do ranking começa pelo identificador da loja

#### AC-12415 — A opção nasce definida pela decisão do dono do produto

- **Dado** a decisão da Q-12407 (desligado ou ligado por padrão)
- **Quando** a coluna da loja é criada para as lojas já existentes
- **Então** o valor inicial segue exatamente essa decisão
- **E** enquanto não houver decisão, a recomendação é nascer desligado (opt-in),
  para que nenhuma loja passe a expor ranking sem ter aceitado

#### AC-12416 — O ranking se atualiza dentro da janela combinada

- **Dado** uma venda nova aceita pela loja
- **Quando** o cliente abre a vitrine depois do tempo máximo de cache aprovado
- **Então** o ranking já considera essa venda

### US-12406 — "Em alta" no feed da plataforma

Como cliente, quero ver no feed os produtos que estão vendendo bem em várias
lojas, para descobrir lojas novas. Esta história só vale se a Q-12402 for
respondida como "ranking da plataforma".

#### AC-12417 — O feed só destaca lojas que aceitaram

- **Dado** a decisão de ter um "em alta" da plataforma
- **Quando** o cliente escolhe a ordem "em alta" no feed
- **Então** só entram lojas visíveis no feed, ativas e com o ranking ligado
- **E** nenhum anúncio pago altera a posição de um produto nessa ordem

#### AC-12418 — Venda grande de um único comprador não domina a lista

- **Dado** uma loja em que um único comprador de atacado levou muitas unidades de
  um produto
- **Quando** o ranking é calculado
- **Então** o produto só entra se atingir o mínimo de pedidos ou de compradores
  distintos aprovado
- **E** a compra de um cliente identificável não pode ser deduzida do ranking

#### AC-12419 — A regra de venda do ranking é a mesma das métricas

- **Dado** o conjunto de situações possíveis de um pedido
- **Quando** a função de banco e a regra de venda do sistema (`situacaoNaVenda`)
  avaliam cada situação
- **Então** as duas concordam em todas
- **E** os pedidos manuais do balcão seguem a decisão da Q-12409

## Suposições

| ID        | Suposição                                                                                                           | Status | Resolução |
| --------- | ------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-12401 | O critério do ranking é unidades vendidas (e não receita), com desempate pelo nome do produto                       | aberta | —         |
| ASM-12402 | A janela é de 30 dias corridos, no fuso da loja, e a lista mostra os 10 primeiros                                   | aberta | —         |
| ASM-12403 | Pedido manual do balcão conta como venda, como já conta nas métricas do painel                                      | aberta | —         |
| ASM-12404 | O cache do ranking é curto, de até 5 minutos, como o do feed                                                        | aberta | —         |
| ASM-12405 | O ranking começa por loja; o "em alta" da plataforma é uma segunda etapa condicionada à Q-12402                     | aberta | —         |
| ASM-12406 | Nenhum número de vendas aparece para o cliente (nada como "mais de 100 vendidos") enquanto a Q-12405 estiver aberta | aberta | —         |
| ASM-12407 | A opção da loja nasce desligada (opt-in), porque ligar por padrão exporia vendas sem consentimento                  | aberta | —         |

## Perguntas em aberto

| ID      | Pergunta                                                                                                                                                                      | Status | Resposta |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-12401 | Fazer ou não fazer o ranking público de mais vendidos?                                                                                                                        | aberta | —        |
| Q-12402 | O ranking é só por loja ou também da plataforma (um "em alta" no feed)?                                                                                                       | aberta | —        |
| Q-12403 | Qual o período e qual o desempate (30 dias corridos, 7 dias, mês fechado; nome, mais recente)?                                                                                | aberta | —        |
| Q-12404 | O critério é quantidade de unidades, receita ou número de pedidos distintos?                                                                                                  | aberta | —        |
| Q-12405 | O cliente pode ver números ("mais de 100 vendidos") ou só o selo e a posição?                                                                                                 | aberta | —        |
| Q-12406 | Recomendação personalizada e anúncios entram nesta função ou ficam de fora?                                                                                                   | aberta | —        |
| Q-12407 | A opção nasce ligada ou desligada para as lojas já existentes?                                                                                                                | aberta | —        |
| Q-12408 | Qual o mínimo para o ranking aparecer (quantos pedidos distintos por produto, quantos produtos na lista)?                                                                     | aberta | —        |
| Q-12409 | Pedido manual do balcão conta no ranking público?                                                                                                                             | aberta | —        |
| Q-12410 | Como provar os critérios que dependem do banco: incluir o projeto de testes de integração da API no comando de verificação ou deixar a prova para o card de validação (#114)? | aberta | —        |
| Q-12411 | A rota pública terá limite de requisições? O limitador atual recusa tudo quando o Redis cai; seria preciso um que deixe passar nesse caso.                                    | aberta | —        |

## Fora do escopo

- Recomendação personalizada por cliente e anúncios, até a resposta da Q-12406.
- Qualquer métrica financeira pública (faturamento, ticket médio).
- O selo "TOP OFERTA" do Stitch: é promoção, não ranking, e não faz parte desta função.
- Funções automotivas: compatibilidade veicular, placa e chassi (P-104).
- Implementar código, alterar banco ou API, publicar conteúdo ou assumir custos
  externos nesta etapa.
