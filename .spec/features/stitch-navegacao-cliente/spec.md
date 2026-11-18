# Spec: Cabeçalho, navegação móvel e rodapé do cliente

> feature: stitch-navegacao-cliente
> status: rascunho

<!--
  Card #105 do RM Board. Bloco de códigos deste card: 10501 a 10599.
  Só documentação: nada aqui está aprovado para implementação. Os critérios
  descrevem o comportamento PROPOSTO para o dono do produto revisar; nenhuma
  resposta das perguntas foi presumida. Plano técnico em design.md e tarefas
  em tasks.md. Referências a outros cards (AC-10414 do #104, ASM-11007 e
  ASM-11011 do #110) são citações, não redefinições.
-->

## Contexto

O SimpleClick permite criar, personalizar e administrar lojas de diferentes
segmentos e receber os pedidos delas. A experiência do cliente serve às lojas
criadas na plataforma. Universokar e autopeças nos mockups do Stitch são só
exemplo visual (P-104, P-105).

O Stitch propõe, para o cliente:

- um **topo** com marca, localização, busca, sacola e avatar;
- no computador, **abas** (Início, Lojas, Favoritos, Pedidos);
- no celular, uma **barra inferior** (Explorar, Lojas, Favoritos, Pedidos,
  Perfil);
- um **rodapé** em colunas.

Hoje o código tem outra estrutura (evidências em design.md, seção 1):

- a navegação comum é a **lateral do usuário** (`LateralDoUsuario`): trilho
  fixo no computador e uma pílula no topo no celular, montada nas molduras de
  `/explorar`, `/conta` e `/loja/[slug]`;
- **não existe** topo do cliente, indicador de localização, sacola no topo nem
  barra inferior do cliente;
- o rodapé é o `RodapeLegal` enxuto (links legais, preferências de cookies e
  ©); o rodapé em colunas só aparece na página inicial e nas páginas legais;
- páginas protegidas de `/conta` mandam o visitante para `/entrar` **sem**
  guardar o destino, então depois de entrar ele não volta.

Divisão combinada por mensagem com os cards vizinhos (06/11/2026):

- **#105 (esta spec):** topo global, abas do computador, barra inferior do
  celular, indicador de localização, sacola no topo, rodapé, retorno ao
  destino e a convivência das barras fixas;
- **#104:** as peças (`BarraInferior`, `Abas`, `Gaveta`, `AvisoFlutuante`) e
  os tokens. Esta spec só as usa;
- **#106:** o conteúdo de `/explorar` abaixo do topo (busca e filtros do feed,
  stories, segmentos, grade e posts);
- **#108:** o cabeçalho curto dentro do cardápio e a barra de categorias;
- **#110:** a sacola, a gaveta e a barra fixa da sacola;
- **#111:** as páginas de `/conta`;
- **#114:** a prova transversal (axe, toque, movimento, estouro lateral e
  área segura das barras fixas).

Nada aqui muda permissões, banco ou API. As funções que já existem
(entrar, criar conta, menu por papel, tutorial, sacola) são preservadas.

## Histórias

### US-10501 — Navegar pelas abas do topo no computador

Como visitante ou cliente no computador, quero abas no topo que me levem às
áreas principais e mostrem onde estou, para trocar de área sem me perder.

#### AC-10501 — Cada aba leva à rota certa e só uma aparece como atual

- **Dado** um cliente no computador, em qualquer página de `/explorar` ou de
  `/conta`
- **Quando** ele aciona uma aba do topo (Explorar, Lojas, Favoritos ou Pedidos)
- **Então** chega à rota existente daquela aba e a aba aparece como a página
  atual
- **E** em qualquer rota exatamente uma aba é anunciada como página atual
  (`aria-current="page"`), inclusive em `/explorar/lojas`, onde "Explorar" e
  "Lojas" não ficam ativas ao mesmo tempo

#### AC-10502 — A marca volta ao início e a busca leva ao campo do feed

- **Dado** um cliente em qualquer página com o topo
- **Quando** ele aciona a marca do SimpleClick ou o ícone de busca
- **Então** a marca leva a `/explorar` e a busca leva ao campo de busca do
  feed
- **E** estando já em `/explorar`, a busca só move o foco para o campo, sem
  recarregar a página

### US-10502 — Navegar pela barra inferior no celular

Como cliente no celular, quero uma barra fixa embaixo com as áreas principais,
para alcançar tudo com o polegar.

#### AC-10503 — A barra mostra cinco destinos e o atual

- **Dado** um cliente numa tela estreita, em `/explorar`, `/conta/*` ou numa
  loja
- **Quando** a barra inferior aparece
- **Então** ela tem cinco itens com rótulo visível (Explorar, Lojas,
  Favoritos, Pedidos e Perfil) e cada item leva a uma rota existente
- **E** exatamente um item é anunciado como página atual, e a regra de
  rótulo visível e área segura é a do AC-10414 do #104

#### AC-10504 — Só uma navegação por largura de tela

- **Dado** uma tela com menos de 64rem de largura e outra com 64rem ou mais
- **Quando** o cliente abre a mesma página nas duas
- **Então** abaixo de 64rem aparece a barra inferior e acima aparecem as abas
  do topo, nunca as duas ao mesmo tempo
- **E** a troca de largura não perde a página atual nem o item ativo

### US-10503 — Saber onde estou: localização no topo

Como cliente, quero ver a localização que o SimpleClick está usando, para
saber a partir de onde as lojas estão sendo ordenadas.

#### AC-10505 — O topo diz de onde as lojas estão sendo contadas

- **Dado** um cliente logado com endereço padrão, um cliente ou visitante com
  localização aproximada autorizada, e um visitante sem nenhuma das duas
- **Quando** o topo é exibido
- **Então** o primeiro mostra "cidade, UF" do endereço padrão, o segundo
  "Perto de você" e o terceiro "Definir localização"
- **E** o rótulo é um botão acionável, com nome acessível que inclui o valor
  mostrado

#### AC-10506 — A coordenada só é guardada com consentimento e é apagada ao sair

- **Dado** um cliente que autorizou a localização aproximada
- **Quando** o navegador guarda a coordenada
- **Então** ela é gravada arredondada (cerca de 100 m), só se o consentimento
  de cookies funcionais estiver dado
- **E** sem esse consentimento a coordenada vale só até fechar a página
- **E** recusar o consentimento ou sair da conta apaga a coordenada guardada
- **E** o navegador só pede a localização quando a pessoa aciona o botão

#### AC-10507 — Mudar a localização muda a ordem "Mais perto"

- **Dado** um cliente em `/explorar` com a ordem "Mais perto"
- **Quando** ele define ou troca a localização pelo topo
- **Então** o feed passa a ordenar por proximidade da nova coordenada
- **E** o rótulo do topo e a ordenação são independentes: um endereço padrão
  sem coordenada mostra a cidade, mas a ordem "Mais perto" continua pedindo
  a localização aproximada

#### AC-10508 — A cidade do endereço padrão vem do servidor e só ela chega ao navegador

- **Dado** um cliente logado com vários endereços salvos
- **Quando** o topo é desenhado
- **Então** o navegador recebe somente cidade e UF do endereço padrão, sem
  logradouro, destinatário nem ponto de referência
- **E** se a leitura falhar ou a sessão estiver vencida, o topo mostra
  "Definir localização" e não redireciona a pessoa

### US-10504 — Ter a sacola ao alcance no topo

Como cliente dentro de uma loja, quero ver quantos itens tenho na sacola e
abri-la de qualquer lugar da loja.

#### AC-10509 — O ícone da sacola mostra a contagem e é anunciado

- **Dado** um cliente dentro de uma loja com 3 itens na sacola
- **Quando** o topo é exibido ou um item é adicionado
- **Então** o ícone mostra 3 e um leitor de tela anuncia "Sacola, 3 itens"
- **E** a contagem é lida pelo navegador, a cada aviso de mudança do carrinho,
  e nunca é desenhada nem guardada em cache no servidor
- **E** com a sacola vazia o ícone aparece sem número

#### AC-10510 — Acionar o ícone abre a mesma sacola

- **Dado** um cliente numa página da loja com o ícone da sacola no topo
- **Quando** ele aciona o ícone
- **Então** abre a sacola já existente da loja (a do #110, ASM-11011), sem
  criar outra
- **E** nas páginas da loja onde a sacola não está montada, o ícone leva à
  página de sacola da loja (hipótese até a Q-10504)

### US-10505 — Visitante e conta sem perder o destino

Como visitante, quero entrar ou criar conta e voltar para onde eu estava, sem
que isso dê a ninguém mais acesso do que a conta dá.

#### AC-10511 — O visitante que aciona uma área de conta entra e volta

- **Dado** um visitante no topo ou na barra inferior
- **Quando** ele aciona Favoritos, Pedidos ou Perfil
- **Então** vai ao fluxo atual de entrada e, depois de entrar, chega ao
  destino que acionou
- **E** dentro de uma loja, "Entrar" abre a janela de acesso e o cliente
  continua na loja, na mesma página

#### AC-10512 — Abrir direto uma página de conta sem sessão também volta ao destino

- **Dado** um visitante que abre direto `/conta/pedidos` (ou qualquer página
  de `/conta`, ou `/escolher-loja`)
- **Quando** é mandado para entrar e conclui a entrada, inclusive com
  verificação em duas etapas
- **Então** chega à página que tentou abrir
- **E** a verificação em duas etapas mantém o destino em todas as saídas, e
  quando a conta precisa gerar códigos de recuperação essa orientação vem
  antes do destino
- **E** nenhuma entrada fica em laço: o destino nunca é uma tela de acesso

#### AC-10513 — Destino de fora ou malicioso é recusado

- **Dado** um endereço de retorno `//evil.com`, `/\evil`, com quebra de linha
  (`%0d%0a`), `/api/...`, uma tela de acesso, ou com mais de 512 caracteres
- **Quando** a pessoa conclui a entrada
- **Então** ela cai no destino padrão do papel dela, não no endereço informado
- **E** o menu, a barra e os redirecionamentos do servidor usam a mesma regra
  de validação

#### AC-10514 — O endereço de retorno nunca leva segredo nem coordenada

- **Dado** um visitante numa página cujo endereço contém um segredo
  (acompanhamento de pedido por token) ou parâmetros de localização
- **Quando** ele aciona "Entrar"
- **Então** o endereço de retorno guarda só a loja (nunca o token do pedido)
  e nunca `lat` nem `lng`
- **E** o token do pedido não aparece nas telas de entrada nem no histórico
  de navegação

#### AC-10515 — O menu do avatar mostra só o que o papel já tem

- **Dado** um visitante, um cliente, uma pessoa da equipe, um dono e um
  administrador
- **Quando** cada um abre o menu do avatar
- **Então** o visitante e o cliente nunca recebem um link para `/painel` nem
  `/admin`, e dono e equipe nunca recebem `/admin`
- **E** o papel vem só da sessão lida no servidor, e as guardas de painel e
  administração continuam iguais

#### AC-10516 — Tutorial, sair e as demais funções da lateral continuam

- **Dado** um cliente que hoje usa "Ver tutorial", "Sair" e o tutorial de
  primeiro acesso
- **Quando** a navegação nova substitui a lateral nas áreas do cliente
  (dependente da Q-10505)
- **Então** "Ver tutorial" e "Sair" continuam acessíveis e funcionando
- **E** os passos do tutorial apontam para elementos que ainda existem

### US-10506 — Nada encoberto no celular

Como cliente no celular, quero que nenhuma barra fixa cubra um botão ou o fim
da página, para conseguir tocar em tudo.

#### AC-10517 — O fim da página fica acima da barra e da área segura

- **Dado** uma página com a barra inferior, num aparelho com recorte ou barra
  de gestos
- **Quando** o cliente rola até o fim
- **Então** o último conteúdo e o último botão ficam totalmente acima da
  barra e da área segura
- **E** isso vale nas larguras de 344, 390, 768 e 1024px

#### AC-10518 — Há uma barra fixa de baixo por vez

- **Dado** o cardápio de uma loja com itens na sacola, em tela estreita
- **Quando** a barra da sacola aparece
- **Então** a barra inferior de navegação não aparece junto, para as duas não
  ficarem empilhadas (ASM-11007 do #110, até a Q-10502)
- **E** ao esvaziar a sacola a barra inferior volta

#### AC-10519 — Cookies, sacola flutuante e aviso ficam acima da barra

- **Dado** o aviso de cookies, a sacola flutuante ou um aviso flutuante e a
  barra inferior visíveis juntos
- **Quando** o cliente olha a tela
- **Então** nenhum deles cobre um item da barra, e todos ficam acima dela
  mais a área segura
- **E** quando o aviso de cookies fecha, os outros descem sem deixar espaço
  vazio

#### AC-10520 — O teclado virtual esconde a barra inferior

- **Dado** a barra inferior visível e um campo de texto da página
- **Quando** o cliente toca no campo e o teclado virtual abre
- **Então** a barra inferior some enquanto o teclado está aberto
- **E** volta quando o teclado fecha

#### AC-10521 — O foco do teclado nunca fica escondido

- **Dado** o topo e a barra inferior fixos
- **Quando** o cliente percorre a página com Tab
- **Então** o elemento focado fica sempre visível, nunca atrás do topo nem da
  barra
- **E** o anel de foco dos itens do topo e da barra continua visível

### US-10507 — Rodapé só com o que existe

Como cliente, quero um rodapé com links que funcionam, para achar as regras
da plataforma e as áreas principais.

#### AC-10522 — Todo link do rodapé leva a uma página que existe

- **Dado** o rodapé do cliente em qualquer largura
- **Quando** cada link é acionado
- **Então** leva a uma página real: Explorar, Lojas, Favoritos, Acompanhar
  pedidos (`/conta/pedidos`), Criar minha loja (`/vender`), termos,
  privacidade, cookies e LGPD
- **E** um teste confere cada link contra as rotas do aplicativo, para
  nenhuma delas virar 404

#### AC-10523 — O rodapé não promete o que não existe

- **Dado** o rodapé do cliente
- **Quando** o dono do produto o revisa
- **Então** ele não mostra cupom, carteira, programa de fidelidade, central
  de ajuda inexistente, "Entrega Flash", "Suporte 24h", CNPJ nem razão
  social de exemplo
- **E** nenhum texto do rodapé usa dado ilustrativo do Stitch como se fosse
  real (P-105, P-107)

#### AC-10524 — O rodapé e o topo somem onde o site é de tela cheia

- **Dado** a página de TV de uma loja
- **Quando** ela é aberta
- **Então** nem o topo, nem a barra inferior, nem o rodapé aparecem
- **E** a regra de onde somem é uma só, usada pelos três

### US-10508 — Não perder o contexto ao navegar

Como cliente, quero que trocar de área mantenha o que eu já tinha feito, para
não repetir buscas.

#### AC-10525 — Trocar entre Explorar e Lojas mantém busca e filtros

- **Dado** um cliente em `/explorar` com uma busca e filtros aplicados
- **Quando** ele troca entre Explorar e Lojas pelo topo ou pela barra
- **Então** a busca e os filtros que valem nas duas listas continuam aplicados
- **E** os filtros que só valem numa das listas não aparecem na outra

#### AC-10526 — Voltar da loja mantém a sacola da loja

- **Dado** um cliente com itens na sacola de uma loja
- **Quando** ele vai ao Explorar pelo topo e volta à loja
- **Então** a sacola continua com os mesmos itens

## Suposições

| ID        | Suposição                                                                                                                                                                                                                                                                                      | Status | Resolução |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-10501 | Nenhuma permissão muda: o papel vem só da sessão lida no servidor (`usuarioDoPedidoAtual`) e as guardas de painel e administração ficam como estão                                                                                                                                             | aberta | —         |
| ASM-10502 | A quebra continua em 64rem: abaixo, barra inferior (o tablet também); acima, abas no topo                                                                                                                                                                                                      | aberta | —         |
| ASM-10503 | O rótulo "Explorar" vale nos dois formatos; o "Início e descoberta" do Stitch no computador vira "Explorar"                                                                                                                                                                                    | aberta | —         |
| ASM-10504 | A cidade do endereço padrão vem de `GET /v1/conta/enderecos`, só para cliente logado, lida no servidor; não há endpoint novo na alternativa recomendada da Q-10503                                                                                                                             | aberta | —         |
| ASM-10505 | A contagem da sacola usa `contarItensDoCarrinho` e `AVISO_DE_CARRINHO_MUDOU`; abrir a sacola usa o evento proposto `sc:abrir-sacola`, cujo dono é o #110 (ASM-11011)                                                                                                                           | aberta | —         |
| ASM-10506 | Topo, barra inferior e rodapé não aparecem em `/tv`, `/painel`, `/admin`, nas telas de entrada e cadastro nem em `/imprimir`; a regra é uma só (`caminhoSemBarra`)                                                                                                                             | aberta | —         |
| ASM-10507 | Telas fora do ZIP do Stitch (conta, acompanhamento do pedido, sobre da loja) usam o mesmo topo, com proposta visual própria no design.md                                                                                                                                                       | aberta | —         |
| ASM-10508 | A prova de sobreposição, teclado virtual, área segura e foco encoberto é de navegador (e2e e simulador) e fica com o #114 (AC-11414); no vitest só se prova o que o CSS e o DOM declaram                                                                                                       | aberta | —         |
| ASM-10509 | Arquivos sem dono no §7 do #103 ficam como "pedido ao dono" até o gerente responder: molduras de explorar e conta, páginas de `/conta`, `features/usuario/*`, `app/_usuario/sessao.tsx`, `usuario.css` e tutorial; o seletor de localização consta como #106 no §4.1 e foi combinado como #105 | aberta | —         |
| ASM-10510 | O validador de retorno é movido para `lib/` (com reexportação em `features/auth/`), porque a regra de fronteira do projeto impede o servidor de importar de `features/`                                                                                                                        | aberta | —         |
| ASM-10511 | O retorno ao destino do painel do lojista (`server/loja-da-pagina.ts`) fica fora desta spec e é assunto do #112                                                                                                                                                                                | aberta | —         |
| ASM-10512 | O Stitch mostra a faixa "Entrega Flash • Suporte 24h" e um seletor "Entregar em" com endereço de entrega; nenhum dos dois entra (promessa inventada, e a entrega é definida por loja)                                                                                                          | aberta | —         |

## Perguntas em aberto

| ID      | Pergunta                                                                                                                                                                                                                                                                                   | Status |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Q-10501 | Para onde vai o item "Lojas"? A: a aba Lojas do feed, `/explorar/lojas` (recomendado, existe hoje); B: uma página nova de lojas e categorias; C: a última loja visitada                                                                                                                    | aberta |
| Q-10502 | Como convivem as barras fixas do celular? A: a barra da página (sacola, ação do produto) substitui a barra inferior (Stitch e hipótese do #110, recomendado); B: as duas empilhadas; C: a barra inferior sempre visível e a sacola flutuante acima dela                                    | aberta |
| Q-10503 | Como o cliente escolhe a localização? A: endereço padrão da conta mais localização aproximada, sem custo (recomendado); B: só localização aproximada; C: seletor de endereço com busca por serviço externo (custo, contrato com o operador, consentimento e revisão de segurança próprios) | aberta |
| Q-10504 | O que a sacola do topo faz fora de uma loja? A: não aparece (recomendado); B: atalho para a última loja com itens (exige API nova, regra de isolamento e consentimento); C: lista das sacolas de todas as lojas                                                                            | aberta |
| Q-10505 | O que acontece com a lateral do usuário nas áreas do cliente? A: o topo e o menu do avatar a substituem (recomendado); B: as duas convivem; C: a lateral fica só para dono, equipe e administração. É a mesma decisão da Q-11103 do #111: uma resposta vale para as duas                   | aberta |
| Q-10506 | Que rodapé aparece no explorar, na conta e dentro da loja? A: o enxuto de hoje (links legais, cookies e ©); B: o enxuto com a linha "Loja criada com SimpleClick" só na loja; C: o rodapé em colunas do Stitch em todas                                                                    | aberta |
| Q-10507 | Quem define o `viewportFit: "cover"` do aplicativo (sem ele a área segura vale 0 no iPhone) e os níveis de camada das barras fixas? A: o #104, na base visual (recomendado); B: o #105, em fila depois do #104; C: decisão do gerente                                                      | aberta |
| Q-10508 | O aplicativo passa a definir `Referrer-Policy` (hoje não define nenhuma)? A: `strict-origin-when-cross-origin` em todo o site; B: `no-referrer` só nas telas de entrada; C: manter como está                                                                                               | aberta |
| Q-10509 | A Política de Privacidade deve passar a citar a localização aproximada (hoje não cita) antes de o topo oferecê-la? A: sim, antes de implementar (recomendado); B: não, o aviso do próprio botão basta                                                                                      | aberta |
| Q-10510 | A `BarraInferior` do #104 só aceita links. O item "Perfil" e o "Entrar" dentro da loja precisam abrir um menu ou a janela de acesso, e a barra precisa se esconder com o teclado. Isso entra na peça do #104 (recomendado) ou o #105 monta uma barra própria?                              | aberta |
