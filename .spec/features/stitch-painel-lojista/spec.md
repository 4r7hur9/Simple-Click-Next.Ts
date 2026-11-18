# Spec: Expansão visual para o painel do lojista

> feature: stitch-painel-lojista
> status: rascunho

<!--
  Card #112 do RM Board. Bloco de códigos deste card: 11201 a 11299.
  Spec de ESPECIFICAÇÃO: nada implementado. O Stitch não tem tela do painel;
  esta spec propõe a aplicação dos tokens e das peças da base visual (#104) às
  telas existentes. Evidências, mapa de rotas, padrões PT1 a PT7 e matrizes em
  design.md. Testes futuros: *.onp.test.ts(x) com [CA-n] @spec:AC-112xx.
  Dependências de outros cards são escritas por extenso, sem o código deles.
-->

## Contexto

O SimpleClick permite criar, personalizar e administrar lojas de qualquer
segmento. O painel do lojista (`/painel/*`) já é completo: pedidos em quadro,
produtos, categorias, estoque, variações, opções, clientes, métricas,
aparência com prévia, configurações, equipe, feed, stories e comentários. O
ZIP do Stitch traz só a experiência do cliente; não há mockup do painel.

Esta feature propõe estender a linguagem visual do redesign (tokens e peças
da base visual do #104) ao painel, mantendo a densidade de trabalho de quem
opera a loja o dia todo. O que muda é a aparência; as funções, as rotas, as
permissões e os contratos de API ficam como estão. A tela de operação não
copia o catálogo do consumidor: lista de trabalho continua tabela, e o
quadro de pedidos continua quadro.

Universokar, autopeças e qualquer dado dos mockups são só exemplo visual
(P-104 e P-105). Os textos de exemplo do painel usam lojas de ramos variados.

## Histórias

### US-11201 — Moldura e menu na linguagem nova, com os mesmos limites de acesso

Como membro da equipe ou dono, quero que o painel reformulado mostre e
permita exatamente o que eu já podia usar, para trabalhar com clareza sem
ganhar nem perder acesso.

#### AC-11201 — A equipe vê só os itens que já via

- **Dado** uma pessoa com papel de equipe na loja
- **Quando** ela abre o painel reformulado em qualquer largura
- **Então** o menu e os atalhos do celular mostram exatamente os itens da
  tabela papel → itens do design.md, sem Configurações, Equipe, Feed e
  Aparência
- **E** a conferência é feita contra essa tabela fixa, não contra o resultado
  da própria função que monta o menu

#### AC-11202 — O dono vê tudo, menos o que a administração desligou

- **Dado** o dono de uma loja com uma seção desligada pela administração
- **Quando** ele abre o painel reformulado
- **Então** vê todos os itens da tabela papel → itens, exceto os da seção
  desligada
- **E** uma seção sem nenhum item visível some do menu (a seção Conta
  continua sempre)

#### AC-11203 — Área negada mostra um aviso claro e nenhum dado

- **Dado** uma pessoa de equipe que digita o endereço de Configurações,
  Aparência, Equipe ou Feed
- **Quando** a página abre
- **Então** a tela avisa que ela não tem acesso, com o texto atual de
  `MENSAGEM_DE_SEM_PERMISSAO`
- **E** o HTML entregue não contém nenhum campo, valor ou contador daquela
  área
- **E** o mesmo vale para uma lista de permissões reduzida simulada sem
  `moderar_comentarios` na área de comentários

#### AC-11204 — Controles internos continuam condicionados

- **Dado** uma pessoa sem a permissão de personalização ou de configuração
- **Quando** ela abre Stories ou Comentários
- **Então** o botão de trocar a foto de perfil e o atalho de configurar a
  moderação continuam ausentes

#### AC-11205 — Nada de dados de área acima da guarda

- **Dado** o painel reformulado
- **Quando** uma pessoa sem permissão abre uma área guardada
- **Então** nenhum componente da moldura nem de um layout acima da guarda
  busca dados daquela área (a busca fica na página ou no cliente, imposta
  pela API)
- **E** o conteúdo da resposta do servidor para essa pessoa não traz dado da
  área

#### AC-11206 — Todo caminho para uma área respeita a permissão

- **Dado** qualquer link ou ação que leva a uma área (menu, atalhos do
  celular, cabeçalho de página, avisos, tutorial, chamadas de estado vazio)
- **Quando** a pessoa não tem a permissão da área
- **Então** o link ou a ação não aparece
- **E** o caso atual dos avisos pendentes, que mostra "Configurar" à equipe,
  segue a decisão da pergunta Q-11207 e não é alterado até lá

#### AC-11207 — Menu e guarda concordam

- **Dado** cada item do menu que aponta para uma rota do painel e cada rota
  guardada
- **Quando** o teste compara a permissão do item com a permissão do caminho
  (`permissaoDoCaminho`) e a guarda do layout
- **Então** as três coincidem para todos os itens
- **E** um item novo ou com endereço mudado que exija permissão diferente da
  área de destino reprova o teste

#### AC-11208 — Contadores só aparecem com permissão

- **Dado** os contadores de pedidos novos e de comentários pendentes no menu
- **Quando** a pessoa não tem `pedidos.operar` ou `moderar_comentarios`
- **Então** o contador não aparece
- **E** nenhuma chamada de rede de leitura do contador é feita

#### AC-11209 — O menu funciona e é acessível nas três larguras

- **Dado** o menu reformulado em 344, 768 e 1280px
- **Quando** a pessoa navega por teclado e por leitor de tela
- **Então** no computador o menu é completo, no tablet cada ícone tem nome
  acessível e no celular a gaveta abre, fecha com Esc e devolve o foco ao
  botão que a abriu
- **E** o item da página atual é indicado por texto acessível, não só por cor
- **E** não há rolagem lateral

#### AC-11210 — A ordem dos avisos do topo é mantida

- **Dado** uma loja suspensa que também tem pendências de configuração
- **Quando** o painel abre
- **Então** o aviso de suspensão aparece antes do aviso de pendências

#### AC-11211 — O menu da administração não regride

- **Dado** o menu lateral que a administração também usa
- **Quando** ele é reformulado para o painel
- **Então** a administração mostra os mesmos itens e o mesmo contador de
  pendências de antes
- **E** a mudança dos arquivos comuns só é liberada ao card da administração
  depois dessa conferência

#### AC-11212 — Trocar de loja não mostra dado da anterior

- **Dado** uma pessoa com duas lojas que escolhe a outra
- **Quando** o painel reabre
- **Então** nenhuma lista, contador ou ficha mostra dado da loja anterior
- **E** o redesign não acrescenta cache no navegador sem chave por loja

### US-11202 — Listas densas sem perder ferramentas

Como lojista, quero listas grandes de produtos, clientes e estoque que
continuem com busca, filtros, página e ações, para achar e agir rápido.

#### AC-11213 — Produtos mantêm página, filtros e ações

- **Dado** uma loja com mais de 50 produtos
- **Quando** o lojista abre a lista de produtos reformulada
- **Então** vê 50 por página, com busca, categoria, situação, marca, estoque,
  faixa de preço e ordem
- **E** busca, filtros e página ficam no endereço, e trocar um filtro volta à
  página 1
- **E** cada linha mantém editar, publicar ou tirar da vitrine, duplicar e
  remover com confirmação

#### AC-11214 — Clientes mantêm busca, filtros, ordenação e página

- **Dado** uma loja com muitos clientes
- **Quando** o lojista abre a lista de clientes reformulada
- **Então** busca, filtros, ordenação e página continuam no servidor e no
  endereço
- **E** cada linha abre a ficha e o cadastro rápido continua disponível

#### AC-11215 — Estoque mantém indicadores, filtros e ajuste

- **Dado** a tela de estoque
- **Quando** o lojista filtra, ordena e ajusta uma quantidade com mais ou
  menos ou digitando
- **Então** os filtros, a ordenação, a página e os indicadores continuam
- **E** a mensagem "Nada com esse filtro" continua no resultado vazio

#### AC-11216 — Variações e opções mantêm busca, filtros e página

- **Dado** as telas de variações e de opções
- **Quando** o lojista busca, filtra por categoria (e por tipo, nas opções)
  e pagina
- **Então** o resultado e as linhas expansíveis funcionam como hoje
- **E** nenhuma ordenação é exigida nem removida: elas não a têm hoje

#### AC-11217 — Categorias mantêm reordenar, ocultar e remover

- **Dado** a lista de categorias
- **Quando** o lojista move, oculta ou remove uma categoria
- **Então** a ordem, a visibilidade e a opção "mover os produtos e remover"
  continuam
- **E** a lista continua sem paginação

#### AC-11218 — Tabela no computador, cartões só no celular

- **Dado** uma lista operacional (produtos, clientes, estoque)
- **Quando** é aberta no computador
- **Então** ela é uma tabela com cabeçalho de colunas
- **E** no celular vira cartões com o mesmo conjunto de campos e as mesmas
  ações, sem rolagem lateral em 344px

#### AC-11219 — Dados pessoais só os que já aparecem

- **Dado** a lista de clientes e os cartões do quadro de pedidos
- **Quando** são exibidos em qualquer largura
- **Então** mostram no máximo os campos de hoje (na lista de clientes: nome,
  telefone, pedidos, total e último pedido)
- **E** e-mail, endereço e observações ficam só na ficha do cliente

#### AC-11220 — Estados vazio, carregando, erro e sem permissão

- **Dado** qualquer lista ou ficha do painel
- **Quando** ela está vazia, carregando, com falha ou recusada por permissão
- **Então** cada estado mostra a mensagem atual, com a tentativa de novo na
  falha
- **E** uma recusa de permissão (403 `sem_permissao`) mostra o estado "sem
  permissão" e não o erro com nova tentativa

#### AC-11221 — Filtros em chip e gaveta com foco correto

- **Dado** a barra de filtros do painel no celular
- **Quando** a pessoa abre a gaveta de filtros
- **Então** o foco fica preso dentro dela, Esc fecha e o foco volta ao botão
  que a abriu
- **E** cada filtro ligado aparece como chip que se remove por teclado e tem
  nome acessível

### US-11203 — Pedidos reformulados sem mudar a operação

Como lojista ou equipe, quero o quadro de pedidos com a aparência nova e o
mesmo ritmo de trabalho, para atender sem reaprender.

#### AC-11222 — O quadro mantém todas as ações

- **Dado** o quadro de pedidos do dia
- **Quando** a equipe trabalha nele
- **Então** continuam as seis etapas, arrastar entre colunas, o botão de
  avançar, o cancelamento com motivo e a janela do pedido
- **E** o dia continua em `?dia=`, os filtros no endereço e a releitura a
  cada 5 segundos
- **E** as colunas continuam carregando em lotes

#### AC-11223 — Etapa e tipo do pedido aparecem em texto

- **Dado** um cartão do quadro e a janela do pedido
- **Quando** são vistos por quem não distingue cores
- **Então** a etapa e o tipo do pedido aparecem escritos, e a cor só reforça

#### AC-11224 — O aviso sonoro de pedido novo continua

- **Dado** o quadro aberto com o som ligado
- **Quando** chega um pedido novo
- **Então** o aviso sonoro e o contador do menu continuam
- **E** o controle do som mantém nome acessível e estado

#### AC-11225 — Pedido manual e detalhe mantêm campos e ações

- **Dado** as telas de pedido manual e de detalhe do pedido
- **Quando** o lojista monta um pedido ou consulta um existente
- **Então** escolha de cliente, itens, entrega, pagamento, totais e ações de
  status continuam com as mesmas validações
- **E** os totais e valores continuam em reais, no formato do país

#### AC-11226 — O cupom impresso não herda o visual da tela

- **Dado** a impressão do cupom de um pedido
- **Quando** o cupom é impresso ou visualizado para impressão
- **Então** sai em fundo branco, texto preto e sem cores nem tema da tela
- **E** o conteúdo e a ordem dos campos do cupom não mudam

### US-11204 — Aparência com a prévia da vitrine real

Como lojista, quero ver a minha vitrine de verdade enquanto edito a
aparência, para publicar sem susto.

#### AC-11227 — A prévia mostra o rascunho na vitrine real

- **Dado** o lojista editando cor de destaque, capa, logo, nome ou descrição
- **Quando** abre a prévia no celular ou no computador
- **Então** vê a vitrine e o cardápio reais da loja com o rascunho aplicado
- **E** as duas páginas da prévia são montadas pelas mesmas telas da loja
  pública, sem cópia própria da vitrine

#### AC-11228 — Nada é gravado até salvar

- **Dado** um rascunho em edição
- **Quando** o lojista só mexe nos campos e olha a prévia
- **Então** nenhum dado da loja é alterado no servidor
- **E** a vitrine pública continua igual até ele salvar

#### AC-11229 — A cor da loja vale dentro da prévia

- **Dado** uma loja com cor de destaque própria
- **Quando** a prévia é exibida
- **Então** a vitrine da prévia usa a cor da loja
- **E** a moldura e os botões do painel continuam com a cor do SimpleClick

#### AC-11230 — O rascunho só aceita valores seguros

- **Dado** um cookie de rascunho com cor inválida, endereço de imagem de fora
  da lista permitida ou campo desconhecido
- **Quando** a prévia o lê
- **Então** o valor inválido é ignorado e a vitrine mostra o dado salvo
- **E** o nome do rascunho nunca é inserido como HTML

#### AC-11231 — O rascunho é restrito e curto

- **Dado** o rascunho da prévia
- **Quando** ele é gravado e depois lido
- **Então** vale só para as páginas de prévia da própria loja e para um
  apelido conferido
- **E** expira em `VALIDADE_DO_RASCUNHO_EM_SEGUNDOS` (600)
- **E** nunca vai na query string nem em mensagem entre janelas

#### AC-11232 — A prévia não é indexada nem clicável

- **Dado** as páginas de prévia
- **Quando** um robô ou a pessoa as acessa
- **Então** as páginas pedem não indexar e são geradas a cada pedido
- **E** os quadros da prévia não recebem clique nem foco por teclado

#### AC-11233 — A prévia do feed continua

- **Dado** a configuração do feed
- **Quando** o lojista marca produtos para o feed
- **Então** a prévia no feed mostra o cartão como hoje, com o nome e a imagem
  do produto

### US-11205 — Criar a loja e dar os primeiros passos

Como pessoa que abre uma loja, quero um cadastro, uma espera e um tutorial
claros e na mesma linguagem do painel.

#### AC-11234 — Cadastro do dono e de outra loja mantêm campos e regras

- **Dado** o cadastro do dono e o cadastro de outra loja
- **Quando** a pessoa preenche e envia
- **Então** os campos, as validações e os tipos de negócio vindos da API
  continuam
- **E** os textos de exemplo mostram lojas de ramos variados, sem dados do
  Stitch

#### AC-11235 — Senhas e token continuam protegidos

- **Dado** os formulários com senha (cadastro, equipe, troca de senha)
- **Quando** o visual dos campos é trocado pelas peças novas
- **Então** o tipo de senha e o preenchimento automático atual continuam
- **E** a senha nunca é exibida nem registrada, e o token de aprovação nunca
  chega a um componente de cliente

#### AC-11236 — A tela de loja em análise ou recusada continua

- **Dado** uma loja em análise ou recusada
- **Quando** o dono abre o painel
- **Então** vê só a tela de aprovação, sem menu, com as mesmas ações
- **E** nenhum dado de outra área aparece

#### AC-11237 — O tutorial acha seus alvos no menu novo

- **Dado** o tutorial de primeiro acesso do dono e da equipe
- **Quando** o menu é reformulado
- **Então** todos os alvos de cada passo são encontrados no menu novo em
  344, 768 e 1280px
- **E** o tutorial não depende de o menu ser escuro, nem de qualquer atributo
  de tema

#### AC-11238 — A equipe só é levada a itens que vê

- **Dado** o tutorial de uma pessoa de equipe
- **Quando** ela avança pelos passos
- **Então** cada passo aponta para um item que o menu dela mostra
- **E** o botão de pular continua disponível

### US-11206 — Métricas, equipe, configurações, catálogo e conteúdo

Como lojista, quero o restante do painel na mesma linguagem, sem perder
nenhuma ferramenta.

#### AC-11239 — Métricas com valor e variação em texto

- **Dado** a página inicial e a de métricas
- **Quando** o lojista escolhe o período ou o dia
- **Então** o período continua no endereço e os cartões mostram valor e
  variação em texto com seta, não só em cor
- **E** os gráficos têm resumo em texto para leitor de tela e a releitura a
  cada 60 segundos continua

#### AC-11240 — Equipe só do dono, com limite e confirmações

- **Dado** a tela de equipe
- **Quando** o dono adiciona, desativa, redefine a senha ou remove alguém
- **Então** todas as ações continuam, com a barra do limite do plano e a
  confirmação antes de desativar ou remover
- **E** a equipe não acessa a tela (AC-11203)

#### AC-11241 — Configurações mantêm navegação, formulários e mensagens

- **Dado** as páginas de contato, entrega, horários, pagamento e impressão
- **Quando** o lojista edita e salva
- **Então** a navegação lateral segue as seções visíveis da loja
- **E** as validações, as mensagens de sucesso e de erro e o pareamento do
  agente de impressão continuam

#### AC-11242 — Produto e subpáginas mantêm campos e ações

- **Dado** o formulário de produto e as páginas de estoque, variações, opções
  e especificações do produto e da categoria
- **Quando** o lojista cria ou edita
- **Então** todos os campos, o envio de imagens, as linhas de preço, as
  grades e os editores continuam
- **E** as validações e as mensagens atuais continuam

#### AC-11243 — Ficha e importação de clientes mantêm o fluxo

- **Dado** a ficha do cliente e a importação de clientes
- **Quando** o lojista consulta, edita ou importa um arquivo
- **Então** o histórico, a edição e o passo a passo da importação continuam
- **E** os dados pessoais aparecem só na ficha

#### AC-11244 — Feed, stories e comentários mantêm as ações

- **Dado** as telas de feed, stories e comentários
- **Quando** o lojista publica, modera ou configura
- **Então** as ações atuais continuam, cada uma só para quem tem a permissão

#### AC-11245 — A ajuda continua acessível

- **Dado** o item de ajuda do menu
- **Quando** o lojista abre a página
- **Então** a página abre sem erro, com o conteúdo atual, na nova linguagem

### US-11207 — Consistência visual verificável

Como dono do produto, quero que o painel inteiro pareça um produto só e que
isso seja conferido por teste.

#### AC-11246 — Só tokens nos arquivos do painel

- **Dado** os arquivos de tela do painel (`.tsx`)
- **Quando** o teste procura cores literais
- **Então** não há cor literal fora do seletor de cor da aparência
- **E** cores, raios e espaços novos entram só pela fonte única de tokens
  (P-108)

#### AC-11247 — Cores das etapas do pedido vêm de tokens

- **Dado** as cores das etapas do pedido, hoje literais em `pedidos.css`
- **Quando** o redesign chega a elas
- **Então** cada etapa usa um token semântico pedido à base visual
- **E** se o token não existir, a exceção fica registrada no design.md com o
  motivo

#### AC-11248 — Sem recurso externo, sem verde errado, sem dado do Stitch

- **Dado** os arquivos do painel e do pacote de interface
- **Quando** o teste procura os padrões proibidos
- **Então** não há o verde `#b2f800`, CDN, Material Symbols, imagem do
  Stitch, Universokar, CNPJ, telefone ou endereço de exemplo (P-102, P-103 e
  P-105)
- **E** não há texto de compatibilidade veicular, placa ou chassi (P-104)

#### AC-11249 — Contraste e foco

- **Dado** o painel reformulado
- **Quando** o contraste é medido
- **Então** o texto tem pelo menos 4,5:1 e o anel de foco 3:1, nos temas
  ativos
- **E** o texto sobre o verde é escuro

#### AC-11250 — O tema do painel não muda sem decisão

- **Dado** a pergunta aberta sobre o tema do painel (Q-11202)
- **Quando** o redesign é aplicado antes da resposta
- **Então** o painel conserva o tema atual: segue o sistema e o menu lateral
  continua escuro
- **E** nenhuma tela do painel depende de um tema específico para funcionar

## Suposições

| ID        | Suposição                                                                                                                                                  | Status | Resolução |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| ASM-11201 | Nenhuma regra comercial nova; funções, rotas, contratos de API e permissões atuais são preservados, e toda prop nova é opcional                            | aberta | —         |
| ASM-11202 | As peças visuais novas (chip, abas, gaveta, aviso flutuante) vêm da base visual do #104; o painel só as usa. Tabela e menu suspenso são só consumidos      | aberta | —         |
| ASM-11203 | Variação de densidade da tabela, se necessária, é pedido à base visual do #104, não mudança local                                                          | aberta | —         |
| ASM-11204 | A prévia da aparência continua em quadros (iframe) com o rascunho num cookie de curta duração, e a rota da prévia continua sendo da vitrine, não do painel | aberta | —         |
| ASM-11205 | A prova futura é vitest em `*.onp.test.ts(x)` com `[CA-n] @spec:AC-112xx`; larguras, contraste renderizado e axe ficam num e2e proposto ao #114            | aberta | —         |
| ASM-11206 | Os textos de exemplo do painel usam lojas de ramos variados; nada do Stitch vira conteúdo                                                                  | aberta | —         |
| ASM-11207 | A tabela papel → itens do design.md reflete o código de hoje e será revisada pelo dono do produto antes de virar teste                                     | aberta | —         |
| ASM-11208 | A permissão de cada membro é a do papel (dono ou equipe); permissão individual por membro não existe hoje                                                  | aberta | —         |

## Perguntas em aberto

| ID      | Pergunta                                                                                                                                                                                                                    | Status | Resposta |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| Q-11201 | O alcance desta onda sem mockup está aprovado (proposta própria a partir dos tokens) ou o painel espera telas do Stitch antes?                                                                                              | aberta | —        |
| Q-11202 | Qual o tema do painel: A claro com menu escuro (como hoje), B escuro do Stitch, C seguir o sistema com alternador? O menu lateral continua sempre escuro? (liga com as perguntas de tema e de fonte da base visual)         | aberta | —        |
| Q-11203 | Qual a prioridade das telas? Proposta: moldura e menu, pedidos, produtos, aparência, o resto                                                                                                                                | aberta | —        |
| Q-11204 | As rotas do painel sem guarda de layout (produtos, clientes, pedidos, categorias, métricas, ajuda e as subpáginas) ganham guarda? Hoje não muda nada (a equipe tem essas permissões); vira risco com permissão por membro   | aberta | —        |
| Q-11205 | A altura da linha da tabela no computador é densa (40px) ou 48px? (liga com a pergunta do alvo de toque da base visual)                                                                                                     | aberta | —        |
| Q-11206 | Qual a fonte do painel: a atual ou a do Stitch? (liga com a pergunta de tipografia da base visual)                                                                                                                          | aberta | —        |
| Q-11207 | Os avisos pendentes mostram "Configurar" também para a equipe, que não abre Configurações. Esconder o botão para a equipe?                                                                                                  | aberta | —        |
| Q-11208 | Quem é dono dos arquivos do painel que a seção de donos do planejamento não lista (equipe, aprovação, tutorial, cadastro do dono, comentários, stories, feed, impressão, `app/(painel)/**`, guarda e a página de cadastro)? | aberta | —        |
| Q-11209 | A busca de cliente por telefone ou e-mail continua indo no endereço da página (fica no histórico e em registros) ou passa a ficar só na memória da tela?                                                                    | aberta | —        |
| Q-11210 | O telefone dos clientes é mascarado nas telas de balcão compartilhado?                                                                                                                                                      | aberta | —        |
| Q-11211 | O cookie da prévia ganha o atributo Secure e é apagado ao salvar ou ao sair da tela?                                                                                                                                        | aberta | —        |
| Q-11212 | O painel deve recusar ser aberto em quadro de outro site (proteção contra embutir)? É reforço de segurança fora do visual, para um card próprio                                                                             | aberta | —        |

## Fora do escopo desta etapa

- Implementar código, criar ou alterar testes, dependências, banco, API ou
  contratos.
- A administração da plataforma (#113), que cita os mesmos padrões de tela.
- Peças novas do pacote de interface (pedido à base visual do #104).
- A rota das páginas de prévia da vitrine (dono: vitrine e catálogo).
- Funções "A decidir" (blog, avaliações, selos, cupons e outras).
- Guardas, cabeçalhos de segurança ou permissões novas (viram cards próprios).
- Compatibilidade veicular, consulta de placa ou chassi, funções de oficina.
- Declarar qualquer decisão como aprovada: tudo aqui é proposta para revisão.
