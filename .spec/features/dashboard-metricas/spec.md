# Spec: Painel e Métricas

> feature: dashboard-metricas
> status: rascunho

## Contexto

O empreendedor precisa abrir o painel e entender o próprio negócio em cinco
segundos: quanto vendi hoje, está melhor ou pior que ontem, o que sai mais e a
que horas o movimento aparece. Esta feature entrega as métricas de pedidos com
os cortes de data que o dono pediu — hoje, três dias, sete dias e intervalo
escolhido a dedo — sempre com o isolamento por loja garantido pelo banco, e
contando tanto o pedido do site quanto o pedido lançado manualmente.

## Histórias

### US-800 — Dono vê o resultado do dia ao abrir o painel

Como dono de loja, quero ver o resumo de hoje assim que entro, para que eu saiba
como está o dia sem procurar nada.

#### AC-800 — Painel abre com os números de hoje

- **Dado** que sou dono de loja com pedidos feitos hoje
- **Quando** abro o painel
- **Então** vejo a quantidade de pedidos, o valor total vendido, o valor médio por pedido e a quantidade de pedidos ainda em aberto, todos referentes ao dia de hoje no fuso da loja

#### AC-817 — Painel separa o vendido do já concluído e do em andamento

- **Dado** um dia com pedidos aceitos, alguns já concluídos e outros ainda em preparo
- **Quando** vejo o resumo do dia
- **Então** vejo três valores distintos e rotulados: o total vendido no período (pedidos aceitos em diante), o quanto já foi concluído e o quanto está em andamento, e a soma do concluído com o em andamento corresponde ao total vendido

#### AC-801 — Painel sem venda no dia orienta em vez de mostrar zero seco

- **Dado** que sou dono de loja e nenhum pedido foi feito hoje
- **Quando** abro o painel
- **Então** vejo os números zerados com uma explicação de que ainda não houve pedido hoje e um caminho para compartilhar o link da minha vitrine, em vez de uma tela vazia sem sentido

#### AC-802 — Comparação com o período anterior mostra a direção

- **Dado** que vendi R$ 500,00 hoje e R$ 400,00 ontem
- **Quando** vejo o resumo do dia
- **Então** o painel indica a variação em relação ao período anterior equivalente, deixando claro se subiu ou caiu e em quanto

### US-801 — Dono troca o período das métricas

Como dono de loja, quero alternar entre hoje, três dias, sete dias e um intervalo
que eu escolho, para que eu analise o movimento no prazo que me interessa.

#### AC-803 — Atalhos de hoje, três e sete dias recalculam tudo

- **Dado** que estou no painel vendo hoje
- **Quando** escolho o atalho de três dias e depois o de sete dias
- **Então** todos os números, listas e gráficos passam a considerar exatamente o período escolhido, e o período em vigor fica visível na tela com as datas de início e fim

#### AC-804 — Intervalo escolhido a dedo é respeitado por inteiro

- **Dado** que quero analisar de 1º a 15 do mês passado
- **Quando** escolho essas duas datas no seletor de intervalo
- **Então** as métricas cobrem os dois dias das pontas por completo, do primeiro instante do dia inicial ao último instante do dia final, no fuso da loja

#### AC-805 — Intervalo inválido é recusado com explicação

- **Dado** que estou escolhendo um intervalo
- **Quando** escolho data final anterior à inicial, ou um intervalo maior que o limite permitido
- **Então** a tela explica o problema e mantém o período anterior em vigor, sem quebrar nem mostrar dado errado

#### AC-806 — Período escolhido sobrevive ao recarregar e pode ser compartilhado

- **Dado** que escolhi um intervalo específico
- **Quando** recarrego a página ou copio o endereço e abro em outra aba
- **Então** o mesmo período continua aplicado, porque ele fica registrado no endereço da página

### US-802 — Dono entende o que vende e quando vende

Como dono de loja, quero saber quais produtos saem mais e em que horários,
para que eu compre melhor e escale minha equipe na hora certa.

#### AC-807 — Lista dos produtos mais vendidos do período

- **Dado** um período com pedidos de produtos variados
- **Quando** vejo o painel daquele período
- **Então** vejo os produtos mais vendidos com quantidade e valor gerado por cada um, ordenados por quantidade, e consigo alternar a ordenação para valor

#### AC-808 — Evolução dos pedidos ao longo do período

- **Dado** um período de sete dias com pedidos distribuídos
- **Quando** vejo o painel
- **Então** vejo a evolução de pedidos e de valor por dia, com os dias sem venda aparecendo como zero e não sumindo do gráfico

#### AC-809 — Distribuição do movimento por hora do dia

- **Dado** um período com pedidos concentrados no fim da tarde
- **Quando** vejo a distribuição por hora
- **Então** identifico as faixas de maior movimento, com as horas sem pedido aparecendo como zero

#### AC-810 — Métricas separam pedido do site e pedido manual

- **Dado** um período com pedidos do site e pedidos lançados manualmente
- **Quando** vejo o painel
- **Então** o total considera os dois canais somados e existe a divisão por canal, para que eu saiba quanto do meu movimento já é digital

### US-803 — Painel não mente e não vaza

Como dono de loja, quero confiar que os números são meus e estão certos, para que
eu tome decisão com base neles.

#### AC-811 — Nenhum pedido de outra loja entra na conta

- **Dado** que sou dono da loja A e a loja B teve movimento no mesmo período
- **Quando** consulto qualquer métrica, inclusive tentando informar o identificador da loja B na requisição
- **Então** os números refletem exclusivamente a loja A, e a tentativa de consultar outra loja é negada

#### AC-812 — Pedido cancelado não infla o faturamento

- **Dado** um período com dez pedidos, sendo dois cancelados
- **Quando** vejo as métricas
- **Então** o valor vendido considera apenas os pedidos válidos, a quantidade de cancelados aparece à parte, e a regra de qual status conta como venda está visível na tela

#### AC-813 — Painel responde rápido mesmo com histórico grande

- **Dado** uma loja com histórico de dezenas de milhares de pedidos
- **Quando** abro o painel no corte de sete dias
- **Então** os números aparecem em menos de um segundo em condição normal de uso, e enquanto carregam a tela mostra estado de carregamento em vez de número errado

#### AC-814 — Número em cache nunca aparece como se fosse do instante

- **Dado** que as métricas do período usam resultado guardado em cache
- **Quando** vejo o painel
- **Então** a tela informa o horário a que os números se referem e oferece atualizar agora, e um pedido novo aparece no painel dentro do prazo definido de atualização

### US-804 — Dono leva os números para fora do sistema

Como dono de loja, quero exportar o movimento do período, para que eu mande ao
meu contador e guarde meu histórico.

#### AC-815 — Exportação do período gera arquivo com os pedidos

- **Dado** um período com pedidos
- **Quando** peço a exportação
- **Então** recebo um arquivo em formato de planilha com um pedido por linha, contendo data, número, cliente, canal, itens, status e valor, respeitando exatamente o período escolhido

#### AC-816 — Exportação não inclui dado de outra loja nem dado sensível demais

- **Dado** que sou dono da loja A
- **Quando** exporto meus pedidos
- **Então** o arquivo contém apenas pedidos da minha loja e não traz dado que eu não veria na tela, e a exportação fica registrada no histórico de auditoria

## Fora de escopo

- Métrica financeira de custo, margem e lucro — a versão 1 mede faturamento por
  pedido, não custo de produto.
- Métrica de origem de tráfego e conversão de visita em pedido (exige rastreio
  de visita na vitrine) — ver Q-800.
- Relatório consolidado do administrador geral somando todas as lojas.
- Metas de venda e alerta automático quando a meta não é atingida.
- Comparação entre lojas ou média do setor.
- Envio programado de relatório por e-mail ou WhatsApp.

## Suposições

| ID      | Suposição                                                                                                                                                                                                      | Status     | Resolução                                                                     |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------- |
| ASM-800 | O fuso da loja é o que define o que é "hoje", e a loja informa o fuso no cadastro, com padrão de horário de Brasília                                                                                           | aberta     | —                                                                             |
| ASM-801 | Consultar direto a tabela de pedidos com os índices certos atende ao volume da versão 1; tabela de números pré-somados só entra quando houver evidência de lentidão                                            | aberta     | —                                                                             |
| ASM-802 | Cache de curta duração no Redis para as métricas atende ao equilíbrio entre painel rápido e número atual, com atualização em até um minuto                                                                     | aberta     | —                                                                             |
| ASM-803 | Pedido conta como venda a partir do momento em que o dono aceita, e cancelado ou recusado nunca conta; além do faturamento, a tela mostra separadamente o quanto já foi concluído e o quanto está em andamento | confirmada | Decidido pelo dono do produto em 17/08/2026: "aceito conta, e mostro os dois" |
| ASM-804 | Intervalo máximo de consulta de um ano protege o plano gratuito de consulta pesada demais                                                                                                                      | aberta     | —                                                                             |
| ASM-805 | O dono olha o painel principalmente pelo celular, então os gráficos precisam ser legíveis em tela pequena antes de serem bonitos em tela grande                                                                | aberta     | —                                                                             |

## Perguntas em aberto

| ID    | Pergunta                                                                                                                                    | Status     | Resposta                                                                                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q-800 | O painel deve contar visitas à vitrine e a taxa de visitas que viram pedido? Isso exige rastreio de visita e traz implicação de privacidade | aberta     | —                                                                                                                                                                        |
| Q-801 | Qual status marca a venda como realizada para fim de faturamento: confirmado pelo dono, saiu para entrega ou concluído?                     | respondida | A partir de aceito pelo dono, com exibição simultânea de três números na tela: vendas do período (aceito em diante), já concluído e em andamento (decisão de 17/08/2026) |
| Q-802 | O administrador geral precisa de painel próprio com números da plataforma (lojas ativas, pedidos no total) já na versão 1?                  | aberta     | —                                                                                                                                                                        |
| Q-803 | A exportação precisa ser compatível com algum sistema de contabilidade específico, ou planilha genérica basta?                              | aberta     | —                                                                                                                                                                        |
