# Spec: Blog com artigos, dicas e publicações editoriais

> feature: decidir-blog
> status: rascunho

<!--
  Card #115 do RM Board ("A decidir"). Bloco de códigos: 11501 a 11599.
  Esta spec é uma PROPOSTA para o dono do produto decidir. Nada aqui está
  aprovado para implementação (P-107): toda tarefa espera a pergunta
  Q-11501 (que faz parte da Q-10305 do #103). Detalhes técnicos, evidências
  e alternativas estão em design.md.
-->

## Contexto

O SimpleClick permite criar, personalizar e administrar lojas de diferentes
segmentos. Hoje o único conteúdo publicado no feed é o produto (o produto é
o "post" da loja). Não existe lugar para um texto útil que não seja um item
à venda: uma dica de uso, um guia de compra, uma novidade da loja. O Stitch
mostra esse tipo de conteúdo ("Dicas dos Especialistas" no início e
"Publicações & Dicas" na vitrine), mas só como referência visual, com dados
ilustrativos que não serão copiados.

Esta spec propõe artigos com endereço próprio: título, resumo, capa, corpo,
autoria, rascunho, publicação e retirada do ar, com ligação opcional a
produtos da loja. O post curto de texto livre dentro do feed é outra função,
do card #116; se os dois forem aprovados, o artigo aparece no feed só como
uma chamada que leva à página de leitura.

## Histórias

### US-11501 — Ler um artigo publicado

Como leitor, quero ler conteúdo útil de uma loja sem que toda publicação
seja um produto à venda, para aprender e confiar mais na loja.

#### AC-11501 — O artigo publicado abre pelo seu endereço

- **Dado** um artigo publicado por uma loja ativa
- **Quando** um visitante, mesmo sem conta, abre o endereço do artigo
- **Então** ele lê o título, a autoria (nome da loja), a data de publicação
  e o corpo do artigo
- **E** a capa, se houver, aparece com o texto alternativo cadastrado

#### AC-11502 — Rascunho e artigo retirado não aparecem para o público

- **Dado** um artigo em rascunho ou retirado do ar
- **Quando** um visitante abre o endereço dele
- **Então** vê a mesma página "não encontrado" de um artigo que nunca
  existiu (404), sem título, resumo nem trecho do conteúdo
- **E** o artigo não aparece em listas, no feed, no mapa do site nem nos
  dados de compartilhamento

#### AC-11503 — Artigo retirado deixa de ser promovido

- **Dado** um artigo publicado que aparece na lista da loja e nos blocos de
  descoberta
- **Quando** quem pode publicar o retira do ar
- **Então** depois da renovação das páginas guardadas em cache, disparada
  pela própria retirada, ele some da lista da loja, do início, da vitrine e
  dos dois mapas do site (o do SimpleClick e o da loja)
- **E** o endereço do artigo passa a responder "não encontrado"

#### AC-11504 — Loja suspensa ou excluída leva os artigos junto

- **Dado** uma loja com artigos publicados
- **Quando** a administração suspende a loja ou ela é excluída
- **Então** nenhum artigo dela continua visível: endereço com "não
  encontrado" e fora de listas, descoberta, feed e mapas do site

### US-11502 — Encontrar os artigos de uma loja

Como cliente, quero ver os artigos de uma loja num lugar só, para achar as
dicas que me interessam.

#### AC-11505 — A lista mostra só artigos publicados, do mais novo ao mais antigo

- **Dado** uma loja com artigos publicados, rascunhos e artigos retirados
- **Quando** um visitante abre a lista de artigos da loja
- **Então** vê só os publicados, do mais novo para o mais antigo, com
  título, resumo e capa
- **E** a lista carrega em páginas, sem trazer todos os artigos de uma vez

#### AC-11506 — Sem decisão, nenhum bloco de artigos aparece

- **Dado** que o blog ainda não foi aprovado ou está desligado para a loja
- **Quando** um visitante abre o início, a vitrine ou o feed
- **Então** nenhum bloco, aba ou link de artigos aparece
- **E** as telas continuam iguais ao que eram antes

### US-11503 — Escrever e publicar um artigo

Como dono de loja, quero escrever artigos, revisá-los antes e publicá-los
quando estiverem prontos, para compartilhar conhecimento com meus clientes.

#### AC-11507 — Criar um rascunho com os campos obrigatórios

- **Dado** um dono de loja no painel
- **Quando** ele cria um artigo com título, resumo, corpo e capa opcional
- **Então** o artigo fica salvo como rascunho, visível só no painel da loja
- **E** se faltar o título, se algum campo passar do tamanho permitido ou se
  houver capa sem texto alternativo, a tela diz o que corrigir e nada é
  publicado

#### AC-11508 — Publicar, editar e retirar ficam registrados

- **Dado** um artigo da loja
- **Quando** quem pode publicar publica, edita ou retira o artigo do ar
- **Então** a situação muda (rascunho, publicado ou retirado) e a página
  pública mostra a versão mais recente depois da renovação do cache
- **E** cada mudança de situação fica na trilha de auditoria da loja, com
  quem fez e quando

#### AC-11509 — A prévia do rascunho é só da loja

- **Dado** um artigo em rascunho
- **Quando** alguém da loja abre a prévia dele
- **Então** vê o artigo como ele vai ficar publicado
- **E** a prévia não é indexada por buscadores nem guardada em cache
  compartilhado, e quem não é da loja recebe "não encontrado"

### US-11504 — Só quem pode, e só na própria loja

Como dono de loja, quero que só as pessoas autorizadas mexam nos artigos da
minha loja, e que outra loja nunca veja meus rascunhos.

#### AC-11510 — Pessoa da equipe sem permissão é recusada

- **Dado** uma pessoa da equipe sem a permissão de publicar artigos
- **Quando** ela tenta criar, editar, publicar, retirar ou apagar um artigo
- **Então** a tela avisa que ela não tem permissão (resposta 403
  sem_permissao) e nada muda
- **E** o item de artigos não aparece no menu do painel para ela

#### AC-11511 — Uma loja não vê nem altera os artigos de outra

- **Dado** os artigos da loja A, publicados e em rascunho
- **Quando** alguém da loja B tenta ler um rascunho, editar, retirar ou
  apagar um artigo da loja A, ou mover um artigo próprio para a loja A
- **Então** a tentativa é recusada e a loja A não sofre nenhuma mudança

### US-11505 — Conteúdo seguro e acessível

Como visitante, quero ler os artigos sem correr risco e com acessibilidade,
mesmo que o texto tenha sido escrito por qualquer loja.

#### AC-11512 — Código no corpo aparece como texto e links perigosos são recusados

- **Dado** um corpo de artigo com trechos como uma tag de script ou HTML
- **Quando** o artigo é salvo e depois aberto
- **Então** o trecho aparece como texto comum e nada é executado
- **E** links que não comecem com http, https ou com um caminho do próprio
  site (como javascript ou data) são recusados ao salvar, e links externos
  abrem sem passar a página de origem

#### AC-11513 — Título e resumo com caracteres especiais não quebram a página

- **Dado** um título ou resumo com aspas, sinais de menor e maior ou um
  fechamento de script
- **Quando** o artigo é publicado e aberto ou compartilhado
- **Então** o texto aparece exatamente como foi escrito
- **E** os dados de compartilhamento e de buscadores da página continuam
  válidos, sem trecho executável

#### AC-11514 — A capa é uma imagem da própria loja, com texto alternativo

- **Dado** um dono de loja enviando a capa de um artigo
- **Quando** ele envia um vídeo, um SVG, um arquivo que não é imagem ou o
  endereço de uma imagem de fora ou de outra loja
- **Então** o envio é recusado com uma mensagem clara
- **E** uma imagem válida só é aceita com texto alternativo preenchido e
  dentro do limite de tamanho

### US-11506 — Indicar produtos no artigo

Como dono de loja, quero indicar produtos da minha loja dentro de um artigo,
para que o leitor encontre o que foi recomendado.

#### AC-11515 — Só produtos da própria loja podem ser indicados

- **Dado** um artigo da loja A
- **Quando** alguém tenta indicar nele um produto da loja B
- **Então** a indicação é recusada e o artigo não mostra nada do produto
  da loja B

#### AC-11516 — Produto indisponível some do artigo, e o artigo continua

- **Dado** um artigo publicado que indica um produto da loja
- **Quando** o produto é ocultado, volta a rascunho ou é apagado
- **Então** o artigo continua no ar e o cartão do produto deixa de aparecer
- **E** a página não revela que o produto existe nem dados dele

### US-11507 — Endereço próprio e estável

Como leitor, quero que o endereço do artigo seja legível e continue
funcionando, para poder compartilhar.

#### AC-11517 — O endereço do artigo é único dentro da loja

- **Dado** uma loja com um artigo publicado num endereço
- **Quando** o dono cria outro artigo com o mesmo endereço ou com
  caracteres fora do formato permitido (letras minúsculas, números e hífen)
- **Então** o painel pede outro endereço e nada é salvo
- **E** o endereço do artigo nunca coincide com as páginas que já existem na
  loja (cardápio, sobre, produto, carrinho e as demais)

### US-11508 — Blog do SimpleClick (só se aprovado na Q-11502)

Como equipe do SimpleClick, quero publicar artigos da própria plataforma,
para ensinar os donos a criar e administrar as lojas.

#### AC-11518 — Só a administração autorizada publica no blog do SimpleClick

- **Dado** o blog do SimpleClick aprovado
- **Quando** uma pessoa da administração com a permissão de conteúdo
  publica um artigo
- **Então** ele aparece com a autoria "SimpleClick" no endereço do blog da
  plataforma e entra na trilha de auditoria da plataforma
- **E** nenhuma credencial de loja consegue criar, editar ou retirar artigo
  da plataforma

## Fora de escopo

- Implementar código, criar testes, alterar banco, API ou dependências
  nesta etapa (só especificação).
- Publicar conteúdo real, contratar serviço externo ou assumir custos.
- Declarar qualquer pergunta como respondida ou decisão como aprovada.
- Post curto de texto livre no feed (card #116).
- Comentários, categorias, agendamento e SEO avançado, até a decisão da
  Q-11505.
- Funções de oficina, compatibilidade veicular e consulta de placa ou
  chassi (P-104); conteúdo e imagens do Stitch como dados reais (P-105).

## Suposições

| ID        | Suposição                                                                                                                                                                                                                              | Status | Resolução |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-11501 | As funções atuais (feed de produtos, stories, curtidas, comentários, favoritos) continuam iguais; o artigo é um conteúdo novo e separado do post de produto                                                                            | aberta | —         |
| ASM-11502 | A proposta padrão é um blog para cada loja; o blog do SimpleClick é uma variante que só entra se a Q-11502 pedir                                                                                                                       | aberta | —         |
| ASM-11503 | A autoria pública é o nome da loja (ou "SimpleClick"); o identificador da pessoa que escreveu fica só na trilha de auditoria e nunca na resposta pública                                                                               | aberta | —         |
| ASM-11504 | O corpo é feito de blocos de tipos fixos (parágrafo, intertítulo, lista, imagem com texto alternativo e link), sem HTML livre                                                                                                          | aberta | —         |
| ASM-11505 | O banco isola os artigos por loja; a diferença entre dono e equipe fica na aplicação, como nas outras áreas do painel                                                                                                                  | aberta | —         |
| ASM-11506 | BLOQUEANTE para a prova: os critérios de isolamento e de autorização (AC-11502, AC-11504, AC-11509, AC-11510, AC-11511, AC-11515, AC-11518) só contam como provados se a verificação do motor rodar também os testes de API e de banco | aberta | —         |
| ASM-11507 | As telas de leitura, lista e edição do artigo não existem no Stitch e precisam de proposta visual própria                                                                                                                              | aberta | —         |
| ASM-11508 | Os textos e imagens de dicas do Stitch são ilustrativos e não viram conteúdo de produção                                                                                                                                               | aberta | —         |

## Perguntas em aberto

| ID      | Pergunta                                                                                                                                                                                                                         | Status | Resposta |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-11501 | Vamos fazer o blog? (faz parte da Q-10305 do #103; nenhuma tarefa começa antes desta resposta)                                                                                                                                   | aberta | —        |
| Q-11502 | O blog é de cada loja, do SimpleClick ou dos dois?                                                                                                                                                                               | aberta | —        |
| Q-11503 | Quem escreve e quem aprova na loja: só o dono (como a permissão do feed) ou também a equipe com uma permissão nova? O SimpleClick precisa aprovar antes de publicar?                                                             | aberta | —        |
| Q-11504 | Se houver blog do SimpleClick, criamos uma permissão de conteúdo para a administração (por exemplo admin.conteudo)?                                                                                                              | aberta | —        |
| Q-11505 | Categorias, comentários (com a moderação que já existe), agendamento de publicação e SEO (mapa do site, compartilhamento) entram na primeira versão ou depois?                                                                   | aberta | —        |
| Q-11506 | O corpo é escrito em blocos simples (recomendado, mais seguro) ou num editor rico com formatação livre?                                                                                                                          | aberta | —        |
| Q-11507 | A administração pode ligar ou desligar o blog por loja? Se sim, ele nasce ligado ou desligado?                                                                                                                                   | aberta | —        |
| Q-11508 | Pergunta conjunta com o #116: se o artigo aparecer no feed como chamada, quem altera o modelo do feed (que hoje só aceita produto) e de que forma? Recomendação conjunta: não alterar o modelo e usar uma fonte separada no feed | aberta | —        |
| Q-11509 | Quem é dono dos arquivos compartilhados que a divisão do #103 não cobre (migrações, schema, permissões, rotas, mapas do site), quando houver implementação?                                                                      | aberta | —        |
| Q-11510 | Quando a loja é excluída, a capa é trocada ou o endereço do artigo muda: apagamos artigos e imagens, guardamos por um tempo, e o endereço antigo redireciona?                                                                    | aberta | —        |
| Q-11511 | Há limite de artigos e de imagens por loja? Ele entra nos limites que a administração já ajusta?                                                                                                                                 | aberta | —        |
