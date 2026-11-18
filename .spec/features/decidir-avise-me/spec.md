# Spec: Avise-me quando o produto voltar ao estoque (A decidir)

> feature: decidir-avise-me
> status: rascunho

<!--
  Card #120 do RM Board. Bloco de códigos deste card: 12001 a 12099.
  PROPOSTA para o dono do produto decidir (P-107). Nada aqui está aprovado,
  nada foi implementado e nenhuma pergunta foi respondida. Os critérios são
  propostos e só valem se Q-12001 for "fazer".
  Evidências do estado atual e alternativas ficam em design.md.
-->

## Contexto

O SimpleClick permite criar, personalizar e administrar lojas de diferentes
segmentos. O Stitch mostra "Avise-me quando chegar" no cartão de um produto
esgotado (catálogo no celular, no tablet e no computador). Hoje o produto
esgotado aparece com o selo "Esgotado" e o botão de compra desabilitado, mas
não existe inscrição, aviso nem evento de reposição. O texto "Previsão de
chegada" e a data do mockup são exemplos visuais: o SimpleClick não tem data
de reposição e esta proposta não promete nenhuma.

A proposta é: o cliente pede o aviso de uma variação esgotada, escolhe e
confirma o canal, e recebe no máximo um aviso quando ela voltar a poder ser
comprada. Pode cancelar. O lojista vê quantas pessoas esperam, sem ver quem
são. O estoque é por variação (produto sem variação só tem a chave
"disponível"); ver Q-12008.

## Histórias

### US-12001 — Pedir o aviso de uma variação esgotada

Como cliente, quero pedir um aviso sobre a variação que estava esgotada, para
voltar à loja só quando ela puder ser comprada.

#### AC-12001 — A inscrição se refere àquela variação

- **Dado** uma variação esgotada de um produto publicado de uma loja ativa
- **Quando** o cliente pede o aviso e confirma o canal
- **Então** a inscrição fica ligada àquela variação (e ao produto), e não a outra variação do mesmo produto
- **E** a tela confirma o pedido com o canal escolhido, sem prometer data nem prazo

#### AC-12002 — O pedido só aparece quando o motivo é "esgotado"

- **Dado** um produto indisponível por "fora do horário", uma variação sem controle de estoque ou um item à venda
- **Quando** o cliente abre o cartão ou a página do produto
- **Então** o botão "Avise-me quando chegar" não aparece
- **E** com motivo "esgotado" o botão aparece junto do selo "Esgotado", sem esconder o selo

#### AC-12003 — O consentimento é explícito e por canal

- **Dado** o formulário do pedido de aviso
- **Quando** o cliente escolhe um canal
- **Então** nenhum canal vem marcado de antemão e o texto diz o que será enviado, por qual canal e que pode cancelar
- **E** a inscrição guarda o canal, a data do consentimento e a versão do texto exibido
- **E** pedir o aviso não liga "Quero receber ofertas e novidades" e não autoriza marketing

#### AC-12004 — Pedir de novo não duplica nem revela

- **Dado** um cliente que já tem inscrição ativa para a variação
- **Quando** ele pede o aviso outra vez
- **Então** continua existindo uma só inscrição ativa
- **E** a resposta tem o mesmo formato de um primeiro pedido, sem indicar que já havia inscrição

#### AC-12005 — Só e-mail confirmado recebe aviso

- **Dado** um cliente cuja conta tem e-mail ainda não confirmado
- **Quando** ele escolhe o canal e-mail
- **Então** o pedido é recusado com uma orientação para confirmar o e-mail
- **E** nenhum aviso é enviado para e-mail não confirmado, mesmo que a inscrição exista

#### AC-12006 — Variação inexistente, oculta ou de outra loja responde igual

- **Dado** uma variação que não existe, está apagada, pertence a produto em rascunho, a loja suspensa ou a outra loja
- **Quando** alguém tenta se inscrever nela
- **Então** a resposta é a mesma "não encontrado" nos quatro casos
- **E** a loja da inscrição é descoberta pelo servidor, nunca informada pelo cliente

### US-12002 — Receber o aviso quando a variação voltar

Como cliente inscrito, quero ser avisado quando a variação puder ser
comprada, sem receber o mesmo aviso várias vezes.

#### AC-12007 — O aviso sai só quando o item pode ser comprado agora

- **Dado** uma inscrição ativa e uma reposição por quantidade (de zero para mais de zero) ou por chave "disponível" (variação ou produto)
- **Quando** o envio é preparado
- **Então** o sistema confere de novo que o produto está publicado e disponível, a loja está ativa, a variação está disponível e dentro do horário de venda
- **E** se alguma condição falhar, nenhum aviso sai e a inscrição continua ativa
- **E** a reposição vale pelos cinco caminhos que mudam o estoque (ajuste manual, devolução por cancelamento, edição e criação da variação, edição do produto)

#### AC-12008 — No máximo um aviso por inscrição e por ciclo

- **Dado** uma inscrição ativa e um estoque que oscila (zero, um, zero, um) ou várias reposições seguidas
- **Quando** os eventos de reposição são processados
- **Então** o cliente recebe no máximo um aviso por inscrição, e a inscrição passa a "avisada"
- **E** um novo aviso só existe com nova inscrição, ou se Q-12006 permitir um novo ciclo

#### AC-12009 — Falha de envio tenta de novo sem duplicar

- **Dado** um envio que falhou (provedor fora do ar, canal indisponível)
- **Quando** o sistema tenta de novo
- **Então** o envio é registrado antes da tentativa e usa uma chave de idempotência, para o cliente receber no mínimo um e no máximo um aviso da inscrição
- **E** depois do limite de tentativas a inscrição fica marcada como "falhou" e o lojista não vê dado pessoal

#### AC-12010 — A venda de um pedido não gera aviso

- **Dado** uma variação com estoque que diminui por um pedido novo
- **Quando** a baixa de estoque acontece
- **Então** nenhum evento de reposição é gravado
- **E** a baixa de estoque não fica mais lenta nem trava por causa da função de aviso

#### AC-12011 — O texto do aviso não promete nada

- **Dado** o aviso pronto para sair
- **Quando** o cliente o lê
- **Então** diz o nome do produto e da variação, o nome da loja e um link para a loja
- **E** não afirma quantidade disponível, prazo, preço nem que o item continuará disponível

### US-12003 — Cancelar a inscrição

Como cliente, quero cancelar o aviso a qualquer momento, para não receber
mais nada sobre aquela variação.

#### AC-12012 — Inscrição cancelada não recebe aviso

- **Dado** uma inscrição cancelada
- **Quando** ocorre uma nova reposição da variação
- **Então** o cliente não recebe o aviso cancelado
- **E** cancelar de novo uma inscrição já cancelada não dá erro

#### AC-12013 — O link de cancelamento é seguro

- **Dado** um aviso enviado por e-mail com link de cancelamento
- **Quando** o cliente abre o link
- **Então** a página só mostra a confirmação, e o cancelamento acontece quando ele confirma (nunca ao apenas abrir o link)
- **E** o link cancela só aquela inscrição, expira com ela, não mostra dados pessoais e o e-mail traz o cancelamento de um clique no cabeçalho
- **E** um link de outra inscrição ou inventado responde igual "link inválido"

#### AC-12014 — Cancelar e conferir na conta

- **Dado** um cliente logado com inscrições
- **Quando** ele abre a lista de avisos na conta
- **Então** vê cada variação esperada, a loja e o canal, e pode cancelar uma a uma
- **E** vê só as próprias inscrições

### US-12004 — O lojista vê a procura

Como lojista, quero saber quantas pessoas esperam uma variação, para decidir
a reposição.

#### AC-12015 — A contagem é só da loja e sem dados pessoais

- **Dado** a página de estoque do painel e inscrições de várias lojas
- **Quando** a equipe da loja abre uma variação esgotada
- **Então** vê apenas o número de pessoas esperando aquela variação na própria loja
- **E** nenhum nome, e-mail ou telefone aparece, e quem não é da equipe da loja é recusado

### US-12005 — Privacidade, isolamento e retenção

Como cliente e como dono do produto, quero que as inscrições respeitem a
privacidade e não vazem entre lojas.

#### AC-12016 — As funções com acesso ampliado não cruzam lojas

- **Dado** as funções de banco que precisam ler além da regra normal (validar a variação, contar a espera, cancelar por link, reservar o envio e ler o destinatário)
- **Quando** cada uma roda com a loja A no contexto
- **Então** nunca lê, conta, cancela nem reserva inscrição da loja B
- **E** nenhuma delas dá ao trabalhador acesso geral ao banco

#### AC-12017 — Exportação e anonimização incluem as inscrições

- **Dado** um cliente que pede os próprios dados ou a anonimização da conta
- **Quando** o pedido é atendido
- **Então** a exportação lista as inscrições e a anonimização apaga as inscrições, os eventos e os envios pendentes da pessoa
- **E** as exclusões que a anonimização já fazia antes (favoritos, comentários e demais) continuam acontecendo

#### AC-12018 — Nenhum dado pessoal em registros e filas

- **Dado** o evento de reposição, o trabalho na fila e os registros de log
- **Quando** o aviso é processado
- **Então** esses registros carregam só identificadores, sem e-mail, telefone nem o código do link de cancelamento
- **E** o endereço é lido só no momento do envio, e conta anonimizada não recebe nada

#### AC-12019 — Retenção e limpeza

- **Dado** inscrições antigas, variação ou produto apagados, loja suspensa ou removida
- **Quando** a limpeza periódica roda
- **Então** inscrições expiradas, de itens apagados e de loja removida são apagadas ou encerradas pelo prazo definido em Q-12005
- **E** a loja suspensa deixa de gerar avisos

#### AC-12020 — Limite contra abuso

- **Dado** uma pessoa ou uma origem de rede que pede muitos avisos em pouco tempo
- **Quando** o limite é atingido
- **Então** novos pedidos são recusados com a orientação de tentar mais tarde
- **E** existe um teto de inscrições ativas por pessoa, que não depende só do cache

## Fora de escopo

- Implementar código, criar testes, alterar banco, API ou dependências.
- Data ou "previsão de chegada" de reposição (o mockup é ilustrativo).
- Provedor de e-mail, WhatsApp oficial ou push: custo e escolha ficam nas perguntas.
- Marketing, ofertas e campanhas: o aviso é um serviço pedido pela pessoa.
- Funções de oficina ou de veículos (P-104).
- Publicar conteúdo, assumir custos externos ou declarar decisões aprovadas.
- Commit, push, PR, merge, worktree ou troca de branch.

## Suposições

| ID        | Suposição                                                                                                                                 | Status | Resolução |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-12001 | As funções que já existem (selo Esgotado, botão desabilitado, painel de estoque, favoritos, conta do cliente) são preservadas             | aberta | —         |
| ASM-12002 | Nenhuma regra comercial nova foi confirmada; tudo acima é proposta para o dono do produto revisar                                         | aberta | —         |
| ASM-12003 | Até a decisão (P-107), o botão "Avise-me" fica oculto e nenhuma tarefa do redesign depende dele                                           | aberta | —         |
| ASM-12004 | O aviso não depende de data de reposição: ele sai quando o item pode ser comprado, não numa data combinada                                | aberta | —         |
| ASM-12005 | O canal e-mail só funciona em produção depois que o provedor de envio for escolhido e configurado (hoje o envio de produção sempre falha) | aberta | —         |
| ASM-12006 | O aviso é um serviço pedido pela pessoa e é separado do consentimento de marketing já existente                                           | aberta | —         |

## Perguntas em aberto

| ID      | Pergunta                                                                                                                                                                 | Status | Resposta |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | -------- |
| Q-12001 | Fazer ou não fazer o "Avise-me quando chegar"?                                                                                                                           | aberta | —        |
| Q-12002 | Qual canal: e-mail, WhatsApp, push ou aviso dentro do site? Um só ou mais de um?                                                                                         | aberta | —        |
| Q-12003 | A conta do cliente é obrigatória para pedir o aviso? Sem conta, exige confirmação dupla por e-mail, resposta igual para qualquer caso, limite por origem e caminho LGPD. | aberta | —        |
| Q-12004 | Quem escolhe e paga o provedor de envio, e qual é o custo mensal aceito?                                                                                                 | aberta | —        |
| Q-12005 | Por quanto tempo guardar a inscrição e quando ela expira se o item nunca voltar?                                                                                         | aberta | —        |
| Q-12006 | Se o item esgotar de novo depois do aviso, o cliente é avisado outra vez ou precisa se inscrever de novo?                                                                | aberta | —        |
| Q-12007 | O lojista vê só a quantidade ou também quem espera? Ver nomes o torna responsável pelos dados e muda o texto de consentimento.                                           | aberta | —        |
| Q-12008 | A função vale também para produto sem variação (só com a chave "disponível")?                                                                                            | aberta | —        |
| Q-12009 | Avisar todos os inscritos de uma vez, mesmo se o estoque novo for menor que o número de inscritos, ou limitar ou escalonar?                                              | aberta | —        |
| Q-12010 | Se a reposição ocorre fora do horário de venda, o aviso espera a loja abrir ou sai assim mesmo?                                                                          | aberta | —        |
| Q-12011 | A prova do consentimento (canal, data, versão do texto) pode ser mantida depois da anonimização da conta?                                                                | aberta | —        |
| Q-12012 | O comando de verificação do ONP (só web e unit) passa a incluir os testes com banco, ou esses critérios ficam com prova manual? Pendência para o gerente e o card #103.  | aberta | —        |
