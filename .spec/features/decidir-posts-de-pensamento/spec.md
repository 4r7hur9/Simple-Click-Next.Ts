# Spec: Posts de pensamento e texto livre no feed

> feature: decidir-posts-de-pensamento
> status: rascunho

<!--
  Card #116 do RM Board ("A decidir"). Bloco de códigos deste card: 11601 a 11699.
  Spec PROPOSTA para o dono do produto decidir. Nada aqui está aprovado para
  implementação (P-107): a primeira pergunta (Q-11601) é se a função entra.
  Os comportamentos abaixo são a proposta recomendada; as alternativas e as
  regras técnicas estão em design.md. Visual de referência: bloco "Dicas dos
  Especialistas" do Stitch (só composição; o conteúdo automotivo do mockup é
  ilustrativo — P-104, P-105).
-->

## Contexto

Hoje todo post do feed (/explorar) nasce de um produto: a loja marca
"publicar no feed" e o produto vira post com foto, preço e botão de compra.
Stories exigem foto ou vídeo e somem em 24 horas; comentários e curtidas só
valem para produto ou loja. Não existe jeito de a loja contar uma novidade,
dar uma dica ou compartilhar um pensamento sem cadastrar um produto.

Esta spec propõe o **post de pensamento**: um texto curto, com foto opcional,
publicado pela loja e mostrado no feed, sem preço nem compra obrigatórios.
O artigo longo com página própria (blog) é outra função, do card #115; aqui
fica só o post curto que vive dentro do feed.

## Histórias

### US-11601 — Publicar um pensamento sem cadastrar produto

Como dono ou funcionário autorizado de uma loja, quero publicar um texto curto
(com foto opcional) no feed, para contar novidades, dicas ou avisos sem
precisar criar um produto.

#### AC-11601 — Pensamento só com texto aparece no feed sem preço nem compra

- **Dado** um dono de loja ativa, com a loja visível no feed
- **Quando** ele escreve só um texto e publica o pensamento
- **Então** o post aparece no feed com o nome e a foto da loja, o texto e a hora da publicação
- **E** o post não mostra preço nem botão de comprar ou adicionar à sacola

#### AC-11602 — Texto vazio ou longo demais é recusado com aviso

- **Dado** um autor autorizado no formulário do pensamento
- **Quando** ele tenta publicar sem texto (ou só com espaços) ou com mais caracteres que o limite (proposta: 1.000)
- **Então** a publicação é recusada e a tela avisa o motivo e o limite
- **E** nada é publicado no feed

#### AC-11603 — Foto opcional é conferida antes de publicar

- **Dado** um autor autorizado anexando uma foto ao pensamento
- **Quando** o arquivo não é uma imagem aceita ou passa do tamanho permitido
- **Então** a publicação é recusada com aviso sobre o formato ou o tamanho
- **E** com uma foto válida o post aparece com a foto acima do texto

#### AC-11604 — "Ver no catálogo" só leva a produto da própria loja

- **Dado** um autor que vincula um produto ao pensamento (opcional)
- **Quando** o produto é da própria loja e está publicado
- **Então** o post mostra o botão "Ver no catálogo", que abre esse produto
- **E** um produto de outra loja é recusado, e um produto que sair do ar faz o botão sumir do post

### US-11602 — Autoria protegida

Como autor de um pensamento, quero que só a minha loja possa alterar ou
remover o que publicamos, para ninguém falar em nosso nome.

#### AC-11605 — Outra pessoa não altera nem remove o pensamento

- **Dado** um pensamento publicado pela loja A
- **Quando** um cliente, alguém da loja B ou um funcionário da loja A sem a permissão de publicar tenta editar ou remover o post
- **Então** a tela avisa "você não tem acesso" (resposta 403, ou 404 para quem é de fora da loja)
- **E** o texto, a foto e a autoria continuam iguais

#### AC-11606 — Edição pela loja mostra "editado" e mantém a autoria

- **Dado** um pensamento publicado pela loja A
- **Quando** o dono ou um funcionário com a permissão de publicar altera o texto
- **Então** o feed mostra o texto novo com a marca "editado"
- **E** a loja autora e a data original da publicação não mudam

### US-11603 — Visibilidade respeitada

Como cliente que navega no feed, quero ver só pensamentos que continuam no
ar, para não encontrar conteúdo removido ou de lojas fora do ar.

#### AC-11607 — Pensamento removido pela loja some do feed e do link

- **Dado** um pensamento que a loja removeu
- **Quando** o feed é recarregado ou alguém abre o link antigo do post
- **Então** o post não aparece mais no feed
- **E** o link mostra "post indisponível", o mesmo aviso de um post que nunca existiu

#### AC-11608 — Pensamento ocultado pela moderação some e a loja não o republica

- **Dado** um pensamento ocultado pela moderação da plataforma
- **Quando** o feed é recarregado
- **Então** o post não aparece para os clientes
- **E** no painel da loja ele aparece como "ocultado pela moderação", sem opção de republicar

#### AC-11609 — Loja fora do feed ou inativa não mostra pensamentos

- **Dado** uma loja com "aparecer no feed" desligado, inativa ou aguardando aprovação
- **Quando** um cliente abre o feed
- **Então** nenhum pensamento dessa loja aparece

### US-11604 — Interagir com o pensamento (se aprovado)

Como cliente, quero curtir, salvar e comentar um pensamento como faço com os
posts de produto, para guardar dicas e conversar com a loja.

#### AC-11610 — Curtir ✦ alterna e atualiza a contagem

- **Dado** um cliente com conta logada vendo um pensamento
- **Quando** ele toca em curtir ✦
- **Então** o ícone fica marcado e a contagem sobe uma unidade
- **E** ao tocar de novo a curtida é desfeita e a contagem volta

#### AC-11611 — Salvar ★ guarda o pensamento na conta do cliente

- **Dado** um cliente com conta logada vendo um pensamento
- **Quando** ele toca em salvar ★
- **Então** o pensamento aparece na lista de salvos da conta dele
- **E** se o pensamento sair do ar, ele some da lista de salvos

#### AC-11612 — Comentário segue as regras e a moderação que já existem

- **Dado** um cliente com conta logada comentando um pensamento
- **Quando** ele envia o comentário
- **Então** valem as mesmas regras dos comentários de produto (limite de tamanho e de envios, bloqueio e aprovação pela loja)
- **E** o comentário pendente aparece na fila de moderação da loja

### US-11605 — Compartilhar

Como cliente ou lojista, quero compartilhar um pensamento por link, para
mandar a dica para alguém.

#### AC-11613 — O link compartilhado abre o pensamento

- **Dado** um pensamento no ar
- **Quando** alguém toca em compartilhar e outra pessoa abre o link recebido
- **Então** o link abre o pensamento, mesmo sem login
- **E** a prévia do link mostra a loja e o começo do texto, sem dados de quem escreveu

### US-11606 — Proteção contra abuso

Como dono do produto, quero limites e moderação nos pensamentos, para o feed
não virar spam nem lugar de conteúdo impróprio.

#### AC-11614 — Limite diário de pensamentos por loja

- **Dado** uma loja que já publicou o número máximo de pensamentos do dia (proposta: 10)
- **Quando** alguém da loja tenta publicar mais um
- **Então** a tela avisa que o limite do dia foi atingido e quando volta a liberar (resposta 429)
- **E** o post não é publicado

#### AC-11615 — Código e formatação no texto aparecem como texto comum

- **Dado** um pensamento cujo texto contém marcação HTML ou script
- **Quando** o post é exibido no feed, no link ou na prévia
- **Então** a marcação aparece como texto comum e nada é executado

#### AC-11616 — Denúncia de pensamento chega à moderação da plataforma

- **Dado** um cliente com conta logada que acha um pensamento impróprio
- **Quando** ele denuncia o post informando o motivo
- **Então** a denúncia aparece na fila de moderação da administração da plataforma
- **E** o mesmo cliente não consegue denunciar o mesmo post duas vezes

#### AC-11617 — O público vê a loja como autora, nunca o funcionário

- **Dado** um pensamento escrito por um funcionário da loja
- **Quando** qualquer pessoa vê o post no feed, no link ou na prévia
- **Então** aparece só a loja como autora
- **E** nome, e-mail ou identificador do funcionário não aparecem na tela nem na resposta pública

## Suposições

| ID        | Suposição                                                                                                                                                  | Status | Resolução |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-11601 | Na proposta só a loja publica: o dono e funcionários com uma permissão nova de publicar no feed; clientes e a plataforma não publicam pensamentos          | aberta | —         |
| ASM-11602 | O pensamento é permanente (fica até a loja remover ou a moderação ocultar); não expira como o story                                                        | aberta | —         |
| ASM-11603 | Formato curto: sem título, texto simples sem formatação, até 1.000 caracteres e no máximo 1 foto                                                           | aberta | —         |
| ASM-11604 | O pensamento entra no ar na hora; a moderação da plataforma atua depois, por denúncia ou revisão                                                           | aberta | —         |
| ASM-11605 | As funções que já existem (post de produto, publicar no feed, stories, curtidas, comentários, favoritos) continuam iguais                                  | aberta | —         |
| ASM-11606 | O visual segue a composição do Stitch (loja autora, foto, texto, ✦, ★, "Ver no catálogo") sem copiar textos, números ou imagens do mockup                  | aberta | —         |
| ASM-11607 | Os critérios de API, banco e permissão só terão prova automática do motor quando a verificação passar a rodar também os testes de API (decisão do gerente) | aberta | —         |

## Perguntas em aberto

| ID      | Pergunta                                                                                                                                                                           | Status | Resposta |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-11601 | Fazer ou não os posts de pensamento?                                                                                                                                               | aberta | —        |
| Q-11602 | Quem pode publicar: só lojas, também a plataforma (SimpleClick), também clientes ou uma combinação?                                                                                | aberta | —        |
| Q-11603 | Publicar exige uma permissão nova da equipe ou vale a permissão atual "feed" (que hoje só configura a loja no feed)?                                                               | aberta | —        |
| Q-11604 | Qual o limite e o formato: até quantos caracteres, com ou sem título, com formatação (negrito, links clicáveis) ou só texto simples?                                               | aberta | —        |
| Q-11605 | O pensamento é permanente ou expira depois de um tempo?                                                                                                                            | aberta | —        |
| Q-11606 | Edição: livre a qualquer momento, só por um tempo depois de publicar, ou não pode editar (só remover)?                                                                             | aberta | —        |
| Q-11607 | Moderação: entra no ar na hora com moderação depois, ou precisa de aprovação prévia da plataforma?                                                                                 | aberta | —        |
| Q-11608 | Quais interações entram: curtir, salvar, comentar, compartilhar (todas, algumas ou nenhuma)?                                                                                       | aberta | —        |
| Q-11609 | Mídia: nenhuma, 1 foto, várias fotos ou também vídeo?                                                                                                                              | aberta | —        |
| Q-11610 | O pensamento tem link próprio com prévia ao compartilhar, ou só existe dentro do feed?                                                                                             | aberta | —        |
| Q-11611 | Onde aparece: só no feed /explorar, também na página da loja, ou nos dois?                                                                                                         | aberta | —        |
| Q-11612 | No feed, os pensamentos ficam numa faixa própria ou misturados aos posts de produto (e, se misturados, em quais ordenações)?                                                       | aberta | —        |
| Q-11613 | Por quanto tempo um pensamento removido e a sua foto ficam guardados antes de serem apagados de vez?                                                                               | aberta | —        |
| Q-11614 | Pergunta conjunta com o #115 (blog): os posts de pensamento e o cartão de artigo entram no feed por uma fonte própria, ou alterando o post de feed atual (que hoje exige produto)? | aberta | —        |
