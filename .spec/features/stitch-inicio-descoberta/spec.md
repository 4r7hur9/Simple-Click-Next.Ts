# Spec: Início e Descoberta do cliente (redesign Stitch)

> feature: stitch-inicio-descoberta
> status: rascunho

<!--
  Card #106 do RM Board. Bloco de códigos deste card: 10601 a 10699.
  Fase: só especificação (06/11/2026). Nada aqui está aprovado para
  implementação; as decisões do dono do produto estão nas perguntas em aberto.
  Referência visual: telas "simpleclick_in_cio_descoberta" (celular) e
  "simpleclick_desktop_in_cio_descoberta" (computador) do ZIP do Stitch. O
  conteúdo delas (Universokar, autopeças, "45 min • Grátis", notas, "Entrega
  Flash", CNPJ, dicas de mecânica) é ilustrativo e não é copiado (P-104,
  P-105). Detalhes técnicos, alternativas e mapa das telas: design.md.
  Topo global, indicador de localização, abas do topo no computador, barra
  inferior do celular e rodapé são do #105 (stitch-navegacao-cliente). Peças
  comuns (Chip, Abas, Gaveta, ícones ✦ e ★, foco) são do #104
  (stitch-base-visual). Esta spec só as usa.
-->

## Contexto

O SimpleClick permite criar, personalizar e administrar lojas de vários
segmentos. A descoberta do cliente acontece hoje em /explorar, que leva à aba
de produtos (/explorar/produtos) e tem a aba de lojas (/explorar/lojas). Ela
já oferece busca, chips por tipo de negócio, filtros de entrega, retirada e
atacado, ordenação (inclusive "mais perto" com a localização do aparelho),
stories de 24 horas, posts de produto com curtir, comentar, compartilhar e
favoritar, e as listas de lojas favoritas e recentes da conta.

O Stitch reorganiza essa experiência numa página de início com seções:
stories, segmentos, lojas favoritas e recentes, destaques e ofertas e o feed
de publicações das lojas, em uma coluna no celular e em grade no computador.
Esta spec define o que essa página mostra, de onde vem cada dado e o que
acontece quando não há dado, sem inventar promessa de prazo, frete, nota ou
localidade, e sem antecipar funções que ainda dependem de decisão (blog,
posts de pensamento, avaliações, selos e mais vendidos).

## Histórias

### US-10601 — Uma página de início organizada em seções

Como cliente, quero abrir o início e ver, em seções claras, as novidades das
lojas, os segmentos, as minhas lojas e os produtos em destaque, para
descobrir o que comprar sem precisar procurar aba por aba.

#### AC-10601 — No celular, as seções aparecem em uma coluna

- **Dado** um cliente com a tela de 390px de largura
- **Quando** ele abre a página de início
- **Então** vê, abaixo do topo do #105, a busca, os stories, os segmentos, as
  suas lojas, os destaques e ofertas e o feed de publicações, nessa ordem
  proposta (Q-10601)
- **E** a página não rola para os lados; só as faixas de stories, segmentos e
  lojas rolam na horizontal, cada uma dentro da sua faixa

#### AC-10602 — No computador, as seções usam a largura em grade

- **Dado** um cliente com a tela de 1280px de largura
- **Quando** ele abre a página de início
- **Então** as suas lojas aparecem em até 3 colunas, os destaques e ofertas
  em até 4 colunas e cada publicação do feed mostra a foto ao lado do texto
- **E** nenhuma seção fica mais larga que a área de conteúdo da página

#### AC-10603 — Cada seção tem título e um caminho para ver tudo

- **Dado** uma seção com mais itens do que cabem no início
- **Quando** o cliente olha o título da seção
- **Então** há um link "Ver todas" ou "Ver tudo" que leva à lista completa e
  paginada daquela seção (lojas em /explorar/lojas, produtos em
  /explorar/produtos ou o destino decidido em Q-10602)

#### AC-10604 — Sem decisão, não há banner de destaque

- **Dado** que a regra do banner de destaque ainda não foi decidida (Q-10603)
- **Quando** o cliente abre o início no computador
- **Então** não aparece banner de loja em destaque nem espaço vazio no lugar
  dele
- **E** a página começa pelos stories e segmentos

#### AC-10605 — Uma seção que falha não derruba as outras

- **Dado** que a leitura de uma seção (por exemplo, os stories) falha ou
  demora mais que o limite de espera
- **Quando** o cliente abre o início
- **Então** as outras seções aparecem normalmente
- **E** a seção com problema some ou mostra "não carregou" com "Tentar de
  novo", sem ocupar o espaço de conteúdo que não veio

### US-10602 — Buscar e filtrar por segmento

Como cliente, quero buscar por nome e escolher um segmento de loja, para
chegar rápido ao que procuro em qualquer ramo.

#### AC-10606 — A busca do início leva a resultados paginados

- **Dado** um cliente no início
- **Quando** ele busca "pão" e confirma
- **Então** vê produtos e lojas que combinam com "pão", em páginas
- **E** o endereço da página guarda a busca, para voltar ou compartilhar o
  mesmo resultado

#### AC-10607 — Os segmentos vêm dos tipos de negócio reais

- **Dado** os tipos de negócio cadastrados na plataforma
- **Quando** o cliente vê a faixa de segmentos
- **Então** cada chip é um tipo de negócio existente, mais "Tudo"
- **E** nenhum segmento do mockup (como "Autopeças & Reparo") aparece se não
  existir nos tipos cadastrados

#### AC-10608 — Sem a lista de segmentos, a página continua

- **Dado** que a lista de tipos de negócio não carregou
- **Quando** o cliente abre o início
- **Então** a faixa mostra só "Tudo" ou some
- **E** a busca, os stories e o feed continuam funcionando

#### AC-10609 — Filtros rápidos ficam num botão e mostram quantos estão ligados

- **Dado** um cliente no celular
- **Quando** ele toca no botão de filtros ao lado da busca
- **Então** encontra entrega, retirada, atacado e a ordenação que já existem
  hoje
- **E** o botão mostra quantos filtros estão ligados

### US-10603 — Continuar de onde parei

Como cliente com conta, quero ver as lojas que favoritei e as que visitei,
para voltar a elas sem procurar de novo.

#### AC-10610 — A conta vê as próprias favoritas e recentes

- **Dado** uma conta com 2 lojas favoritas e 3 lojas visitadas nos últimos 30
  dias
- **Quando** ela abre o início
- **Então** a seção das suas lojas mostra essas lojas, e só elas
- **E** a página pediu os dados com a sessão dessa conta, lida no servidor

#### AC-10611 — Uma conta nunca vê as lojas de outra

- **Dado** duas contas, A e B, cada uma com favoritas e visitas diferentes
- **Quando** cada uma pede as suas favoritas, as suas recentes e a lista de
  produtos do feed
- **Então** A recebe só as lojas e as estrelas de A, e B só as de B
- **E** nenhuma resposta com sessão fica guardada em cache para servir outra
  pessoa

#### AC-10612 — Visitante sem conta vê um convite, não dados de ninguém

- **Dado** um visitante sem sessão
- **Quando** ele abre o início
- **Então** a seção das suas lojas é trocada por um convite curto para entrar
  ou some, sem espaço vazio
- **E** a página não pede nenhum dado de conta ao servidor

#### AC-10613 — A estrela de favorito do produto está certa em todas as páginas

- **Dado** uma conta que favoritou um produto que aparece na página 3 do feed
- **Quando** ela rola o feed até a página 3
- **Então** esse produto aparece com a estrela marcada
- **E** o mesmo vale para a primeira página e para os destaques

#### AC-10614 — Sessão vencida não apaga os favoritos em silêncio

- **Dado** uma pessoa cuja sessão venceu enquanto navegava
- **Quando** o início carrega de novo
- **Então** a tela pede para entrar de novo ou esconde as estrelas e a seção
  das suas lojas
- **E** não mostra todas as estrelas desmarcadas como se ela não tivesse
  favoritos

#### AC-10615 — Recentes seguem a janela de 30 dias

- **Dado** uma conta que visitou uma loja há 31 dias e outra há 2 dias
- **Quando** ela vê as suas lojas recentes
- **Então** só aparece a loja visitada há 2 dias
- **E** a lista tem no máximo 20 lojas

### US-10604 — Descobrir sem dar a localização

Como cliente, quero usar o início mesmo sem liberar a minha localização, para
não ser obrigado a compartilhá-la.

#### AC-10616 — Sem localização, nada mostra distância

- **Dado** um cliente que negou a localização ou cujo navegador não a informa
- **Quando** ele busca produtos e vê lojas no início
- **Então** nenhum cartão mostra distância, cidade ou endereço de entrega
  inventados
- **E** a ordem "mais perto" vira relevância, com o aviso que já existe hoje

#### AC-10617 — Com localização, a distância é a calculada

- **Dado** um cliente que liberou a localização
- **Quando** ele vê uma loja com endereço cadastrado e outra sem endereço
- **Então** a primeira mostra a distância calculada (por exemplo "800 m" ou
  "6,4 km") e a segunda não mostra distância

#### AC-10618 — A localização é guardada com pouca precisão e não vai para log

- **Dado** um cliente que liberou a localização
- **Quando** o site usa essa localização numa busca
- **Então** as coordenadas são arredondadas (3 casas, cerca de 100 m) no
  aparelho e de novo no servidor, mesmo que o endereço chegue com mais casas
- **E** as coordenadas não são gravadas em log da aplicação
- **E** antes de pedir a permissão, a tela diz para que ela serve

#### AC-10619 — Sair da conta apaga a localização guardada no aparelho

- **Dado** um cliente com a localização guardada no navegador
- **Quando** ele sai da conta
- **Então** a localização guardada é apagada
- **E** a próxima pessoa no mesmo aparelho não herda a ordem "mais perto"

### US-10605 — Destaques, ofertas e publicações reais das lojas

Como cliente, quero ver produtos e publicações de verdade das lojas, com
preço certo, para confiar no que aparece no início.

#### AC-10620 — Destaques e ofertas só com dados da loja

- **Dado** produtos publicados no feed por lojas ativas
- **Quando** o cliente vê a seção de destaques e ofertas
- **Então** cada cartão mostra foto, loja, nome e preço vindos do produto
- **E** o preço "de" riscado só aparece quando a loja informou o preço
  anterior
- **E** a linha de atacado ("a partir de N unidades") só aparece quando o
  produto tem faixa de atacado

#### AC-10621 — As abas da seção usam só ordenações e filtros existentes

- **Dado** a seção de destaques e ofertas no computador
- **Quando** o cliente troca entre as abas
- **Então** "Recentes" mostra os mais novos e "Atacado" mostra só os com
  preço de atacado
- **E** não há aba "Mais pedidos" enquanto o card #124 não for decidido

#### AC-10622 — O feed carrega em páginas, sem repetir nem pular

- **Dado** um feed com mais publicações do que cabem numa página
- **Quando** o cliente rola até o fim da lista
- **Então** a página seguinte é carregada e somada, sem repetir publicações
  já vistas
- **E** se a carga falhar, aparece "Tentar de novo"; no fim, aparece que não
  há mais publicações

#### AC-10623 — As ações das publicações continuam funcionando

- **Dado** uma publicação no feed do início
- **Quando** o cliente curte, abre os comentários, compartilha, favorita a
  loja ou o produto e abre um story
- **Então** cada ação funciona como hoje, com os ícones ✦ (curtir) e ★
  (favoritar) do #104 (AC-10405, AC-10406)
- **E** a gaveta de comentários segue as regras de foco da Gaveta do #104
  (AC-10412)

### US-10606 — Página útil mesmo vazia

Como cliente, quero que o início continue útil quando falta conteúdo, para
não ver buracos nem coisas inventadas.

#### AC-10624 — Sem stories, a faixa some inteira

- **Dado** que nenhuma loja tem story ativo
- **Quando** o cliente abre o início
- **Então** a faixa de stories e o título dela não aparecem
- **E** a seção seguinte sobe para o lugar, sem espaço em branco

#### AC-10625 — Sem ofertas, aparece um caminho útil

- **Dado** que nenhuma loja publicou produto no feed
- **Quando** o cliente abre o início
- **Então** a seção de destaques e o feed dão lugar a um aviso curto com um
  caminho útil (por exemplo ver as lojas por segmento)
- **E** nenhum cartão de exemplo, preço ou loja fictícia é mostrado

#### AC-10626 — Sem conexão com as lojas, o aviso vem com "Tentar de novo"

- **Dado** que o servidor de lojas não responde
- **Quando** o cliente abre o início
- **Então** aparece "O feed não carregou" com "Tentar de novo"
- **E** o topo e a navegação do #105 continuam usáveis

### US-10607 — Espaço reservado para o que ainda vai ser decidido

Como dono do produto, quero que o início não mostre funções que eu ainda não
aprovei, para decidir cada uma sem retrabalho.

#### AC-10627 — Funções "A decidir" ficam ocultas

- **Dado** que blog (#115), posts de pensamento (#116), avaliações (#117),
  selos de loja (#118) e mais vendidos (#124) ainda não foram aprovados
- **Quando** o cliente abre o início
- **Então** não aparece seção de dicas ou artigos, nota com estrelas, número
  de avaliações, selo de loja verificada, "Mais vendidos", "Em alta" ou "Top
  oferta"
- **E** a página não deixa espaço vazio no lugar dessas funções

#### AC-10628 — Nada do conteúdo do mockup nem do tema automotivo

- **Dado** o código das telas de início
- **Quando** ele é verificado
- **Então** não contém textos do mockup como "Universokar", "Entrega Flash",
  "Suporte 24h", "45 min", "Sem taxas ocultas" ou CNPJ de exemplo
- **E** passa nos princípios P-103 e P-104 (nada de recurso externo do
  Stitch, chassi, placa ou compatibilidade veicular)

### US-10608 — Os caminhos de hoje continuam valendo

Como cliente que já usa o SimpleClick, quero que os links e favoritos que já
tenho continuem funcionando, para não me perder com a página nova.

#### AC-10629 — Links atuais de /explorar continuam abrindo

- **Dado** um link salvo para /explorar, /explorar/produtos?busca=pão ou
  /explorar/lojas?lista=favoritas
- **Quando** o cliente abre esse link depois da mudança
- **Então** chega à página certa com a mesma busca e os mesmos filtros
- **E** o tutorial do cliente, o menu do usuário e o mapa do site continuam
  apontando para páginas que existem

#### AC-10630 — O início tem título e endereço canônico próprios

- **Dado** um buscador ou uma prévia de link
- **Quando** lê a página de início
- **Então** encontra um título e uma descrição do início do SimpleClick e um
  endereço canônico único, sem dados de nenhuma conta

#### AC-10631 — Tudo se alcança pelo teclado com foco visível

- **Dado** um cliente que navega só pelo teclado
- **Quando** ele percorre o início com Tab
- **Então** alcança a busca, cada story, cada chip, cada aba, cada cartão e as
  ações das publicações, na ordem da tela
- **E** o foco aparece em todos eles com o anel do #104 (AC-10417)

## Fora de escopo

- Implementar código, criar testes, alterar banco, API ou dependências nesta
  fase.
- Topo global, indicador ou seletor de localização, abas do topo no
  computador, barra inferior do celular e rodapé (card #105).
- Peças comuns e tokens visuais (card #104).
- Blog, posts de pensamento, avaliações, selos, cupons, mais vendidos e
  fidelidade (cards #115–#125): só o espaço oculto aqui.
- Prazo de entrega estimado, "frete grátis" e faixas de benefício sem base no
  produto ("Entrega Flash", "Sem taxas ocultas").
- Mudar a landing (/) para virar o início.
- Funções de oficina, compatibilidade veicular, placa ou chassi.
- Commit, push, PR, merge, worktree ou troca de branch.

## Suposições

| ID        | Suposição                                                                                                                                                                                                                                     | Status | Resolução |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-10601 | As funções que já existem no feed (stories, curtir, comentar, compartilhar, favoritar loja e produto, aba Lojas, filtro de atacado, ordem mais perto) são preservadas e só ganham a composição nova                                           | aberta | —         |
| ASM-10602 | O topo, o indicador de localização, a barra inferior e o rodapé são do #105 (combinado por mensagem em 06/11); a matriz do #103 ainda dá o seletor de cidade ao #106 e a correção foi pedida ao #103                                          | aberta | —         |
| ASM-10603 | As seções usam só leituras que já existem (produtos e lojas do feed, favoritas e recentes da conta, stories e tipos de negócio); a única mudança de dados prevista é mandar a sessão na leitura de produtos                                   | aberta | —         |
| ASM-10604 | A prova de que uma conta não vê dados de outra (AC-10611) precisa de teste de API com banco, que o verificador da spec ainda não roda; a parte do site é provada por teste de tela e a de banco depende do segundo comando proposto pelo #114 | aberta | —         |
| ASM-10605 | A moldura do /explorar já é escura (data-tema escuro), então a página de início segue escura qualquer que seja a decisão de tema do #103 (Q-10304)                                                                                            | aberta | —         |
| ASM-10606 | A paginação continua por número de página; sem desempate estável na ordem, um produto novo pode empurrar outro entre páginas, e a tela tira os repetidos pela chave do item                                                                   | aberta | —         |
| ASM-10607 | O cartão de loja do feed não traz horário de funcionamento hoje; "aberta agora" no cartão do início só aparece se a leitura passar a mandar essa informação, sem inventá-la                                                                   | aberta | —         |
| ASM-10608 | O tablet (768px a 1023px) usa a composição de computador com menos colunas; não há mockup próprio                                                                                                                                             | aberta | —         |

## Perguntas em aberto

| ID      | Pergunta                                                                                                                                                                              | Status | Resposta |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-10601 | A ordem das seções fica busca, stories, segmentos, suas lojas, destaques e ofertas, feed (proposta) ou outra?                                                                         | aberta | —        |
| Q-10602 | O /explorar passa a ser a página de início com seções (as abas Produtos e Lojas viram "ver tudo") ou continua levando direto à aba de produtos com as seções no topo dela?            | aberta | —        |
| Q-10603 | Banner de destaque no computador: não ter, escolher por regra automática (por exemplo loja nova com capa), escolher por curadoria da administração ou vender como espaço patrocinado? | aberta | —        |
| Q-10604 | Se houver espaço patrocinado, ele é separado do destaque editorial e sempre leva o rótulo "Patrocinado"? Quem compra e quem aprova?                                                   | aberta | —        |
| Q-10605 | Haverá personalização além dos filtros (por exemplo mostrar primeiro os segmentos que a pessoa mais visita) ou o início é igual para todos, mudando só as suas lojas?                 | aberta | —        |
| Q-10606 | O botão "+" do cartão de produto adiciona direto à sacola daquela loja a partir do início, ou leva ao produto na loja como hoje?                                                      | aberta | —        |
| Q-10607 | "Seguir loja" das publicações é o mesmo que favoritar a loja (como hoje) ou uma função nova?                                                                                          | aberta | —        |
| Q-10608 | A faixa de benefícios do computador entra só com o que é verdade (por exemplo "acompanhe o pedido pelo WhatsApp") ou sai?                                                             | aberta | —        |
| Q-10609 | Quantos itens cada seção mostra no início antes do "ver tudo" (proposta: 8 destaques, 6 lojas, 12 publicações por página)?                                                            | aberta | —        |
| Q-10610 | Para visitante sem conta, a seção das suas lojas vira convite para entrar ou é trocada por lojas novas da plataforma?                                                                 | aberta | —        |
| Q-10611 | As coordenadas continuam no endereço da página (permitindo compartilhar o resultado) ou saem do endereço e ficam só no aparelho?                                                      | aberta | —        |
| Q-10612 | Qual desempate fixo vale na ordem do feed (por exemplo data de publicação e depois identificador), para a rolagem não repetir nem pular itens?                                        | aberta | —        |
