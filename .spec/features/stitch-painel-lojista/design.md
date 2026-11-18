# Design: Expansão visual para o painel do lojista

> feature: stitch-painel-lojista · card #112 · 09/11/2026

Documento de especificação. Nada aqui está aprovado nem implementado: as
decisões do dono do produto estão nas perguntas Q-11201 a Q-11212 da spec. As
dependências de outros cards são escritas por extenso, sem o código deles.

## 1. Origem e limites

- O ZIP do Stitch não tem tela do painel. A proposta aplica ao painel os
  tokens e as peças da base visual do #104, sem criar peça própria: o que
  faltar é pedido àquele card (ASM-11202).
- Nada de catálogo do consumidor nas telas de trabalho: lista continua tabela
  no computador e quadro continua quadro (AC-11218).
- Universokar, autopeças e dados dos mockups não entram (P-104 e P-105).
- Funções e rotas atuais ficam como estão; muda a aparência (ASM-11201).
- Caminhos abaixo são relativos a `apps/web/src/`, salvo indicação.

## 2. Estado atual (evidência)

| Área                  | Evidência                                                                                                                                                                             | Observação                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Moldura               | `app/(painel)/painel/layout.tsx`                                                                                                                                                      | `AvisoDeSuspensao` antes de `AvisosPendentes`, `MenuDoPainel`, `Tutorial`                                                           |
| Aprovação             | `app/(painel)/painel/_aprovacao/TelaDeAprovacaoDaLoja.tsx` (servidor) chama `features/aprovacao/TelaDeAprovacao.tsx`                                                                  | substitui o painel se a loja está em análise ou recusada; o token fica no servidor                                                  |
| Menu                  | `features/painel/secoes-do-painel.ts` (`secoesDoPainel`, `atalhosDoPainel`, `ATALHOS_DO_CELULAR`), `MenuDoPainel.tsx`, `MenuLateral.tsx`                                              | uma lista só para computador, tablet e celular; `MenuLateral` é sempre escuro (`data-tema`)                                         |
| Menu da administração | `features/painel/MenuDaAdministracao.tsx` (`secoesDaAdministracao`)                                                                                                                   | usa o mesmo `MenuLateral`; dono dos arquivos comuns é este card, em fila com a administração                                        |
| Contadores            | `MenuDoPainel.tsx` chama `usePedidosNovos` e `useComentariosPendentes` só quando `pode(...)`                                                                                          | sem permissão, não há leitura                                                                                                       |
| Permissões            | `packages/contracts/src/permissoes.ts` (`MATRIZ_DE_PERMISSOES`, `DA_EQUIPE`, `MENSAGEM_DE_SEM_PERMISSAO`), `lib/permissoes.ts` (`permissoesDaLoja`, `pode`, `permissaoDoCaminho`)     | `/v1/eu` devolve a matriz do papel (`apps/api/src/modules/auth/eu.routes.ts`); sem permissão por membro                             |
| Guarda                | `app/_painel/GuardaDoPainel.tsx` (`GuardaDoPainel`) mostra `features/painel/SemPermissao.tsx`                                                                                         | só em config, aparência, equipe, feed, comentários, estoque, variações, opções e stories                                            |
| Listas                | `features/painel-estoque/lista-paginada.tsx` (`useConsultaNaUrl`, `Paginacao`, `CampoDeBusca`), `features/painel-filtros/BarraDeFiltros.tsx`                                          | a barra faz o próprio `showModal()` da gaveta; `filtros.css` guarda `.sc-filtros__chip` e `.sc-gaveta`                              |
| Pedidos               | `features/painel-pedidos/QuadroKanban.tsx`, `useQuadroDoDia.ts`, `AvisoSonoro.tsx`, `MontarPedido.tsx`, `DetalheDoPedido.tsx`; `features/impressao/FolhaDoCupom.tsx`                  | releitura a cada 5 s (`INTERVALO_DO_QUADRO_MS`); estilos em `packages/ui/styles/pedidos.css` e `features/painel-pedidos/quadro.css` |
| Prévia                | `features/config/PreviaDaLojaReal.tsx`, `lib/rascunho-da-vitrine.ts` (`lerRascunho`), `server/previa.ts` (`resultadoComRascunho`), `app/(loja)/loja/[slug]/previa/[parte]/page.tsx`   | quadros de 1280 e 390px, cookie de 600 s, páginas reais da loja                                                                     |
| Tutorial              | `features/tutorial/passos.ts` (`PASSOS_DO_TUTORIAL`, `MENU_DO_PAINEL`)                                                                                                                | o alvo do menu é o seletor `aside[aria-label][data-tema="escuro"]`, acoplado ao tema do menu                                        |
| Estilo                | `packages/ui/styles/theme.css`, `componentes.css`; não existe `painel.css`                                                                                                            | o painel usa Tailwind com `var(--cor-*)`; sem alternador de tema                                                                    |
| Cores literais        | `.tsx` do painel: só `features/config/SeletorDeCor.tsx`; CSS: `pedidos.css`, `stories.css` e `features/tutorial/tutorial.css`                                                         | as etapas do pedido usam `--etapa` com cor literal                                                                                  |
| Testes                | `apps/web/tests/` (`menu-lateral`, `menu-do-painel`, `guarda-do-painel`, `permissoes`, `painel-*`, `config-*`, `previa-da-loja`, `equipe`, `tutorial`) e `e2e/specs/painel-*.spec.ts` | nenhum `*.onp.test.ts(x)` existe ainda                                                                                              |

Homônimos: há dois `Paginacao` (`features/painel-estoque/lista-paginada.tsx` e
`features/feed/TelaDoFeed.tsx`) e dois `CartoesDoPainel`
(`features/dashboard/` e `features/admin-dashboard/`). Os testes futuros citam
sempre o caminho.

## 3. Mapa de rotas do painel

Todas as rotas de `app/(painel)/painel/**/page.tsx`.

| Rota                                     | Componente principal                                | Guarda de layout         | Padrões            | Tarefa  |
| ---------------------------------------- | --------------------------------------------------- | ------------------------ | ------------------ | ------- |
| `/painel`                                | `features/dashboard/InicioDoPainel.tsx`             | não                      | PT1, PT7           | T-11208 |
| `/painel/metricas`                       | `features/dashboard/MetricasPorPeriodo.tsx`         | não                      | PT1, PT7           | T-11208 |
| `/painel/pedidos`                        | `features/painel-pedidos/QuadroKanban.tsx`          | não                      | PT1, PT2, PT5      | T-11205 |
| `/painel/pedidos/novo`                   | `features/painel-pedidos/MontarPedido.tsx`          | não                      | PT1, PT5           | T-11205 |
| `/painel/pedidos/[id]`                   | `features/painel-pedidos/DetalheDoPedido.tsx`       | não                      | PT1, PT4, PT5      | T-11205 |
| `/painel/clientes`                       | `features/painel-clientes/ListaClientes.tsx`        | não                      | PT1, PT2, PT3      | T-11204 |
| `/painel/clientes/[id]`                  | `features/painel-clientes/FichaCliente.tsx`         | não                      | PT1, PT4           | T-11204 |
| `/painel/clientes/importar`              | `features/painel-clientes/importacao/`              | não                      | PT1, PT6           | T-11204 |
| `/painel/produtos`                       | `features/painel-catalogo/ListaProdutos.tsx`        | não                      | PT1, PT2, PT3, PT5 | T-11203 |
| `/painel/produtos/novo`                  | `features/painel-catalogo/FormularioProduto.tsx`    | não                      | PT1, PT4           | T-11203 |
| `/painel/produtos/[id]`                  | `PaginaDeEdicaoDeProduto` (página do cliente)       | não                      | PT1, PT4           | T-11203 |
| `/painel/produtos/[id]/estoque`          | `features/painel-catalogo/AjusteDeEstoque.tsx`      | não                      | PT1, PT3           | T-11203 |
| `/painel/produtos/[id]/variacoes`        | `features/painel-catalogo/GradeDeVariacoes.tsx`     | não                      | PT1, PT3           | T-11203 |
| `/painel/produtos/[id]/opcoes`           | `features/painel-catalogo/EditorGrupoOpcao.tsx`     | não                      | PT1, PT4           | T-11203 |
| `/painel/categorias`                     | `features/painel-catalogo/ListaCategorias.tsx`      | não                      | PT1, PT3, PT5      | T-11203 |
| `/painel/categorias/[id]/especificacoes` | `features/painel-catalogo/EditorEspecificacoes.tsx` | não                      | PT1, PT4           | T-11203 |
| `/painel/estoque`                        | `features/painel-estoque/PainelDeEstoque.tsx`       | sim: catalogo.produtos   | PT1, PT2, PT3      | T-11203 |
| `/painel/variacoes`                      | `features/painel-variacoes/PainelDeVariacoes.tsx`   | sim: catalogo.produtos   | PT1, PT2, PT3      | T-11203 |
| `/painel/opcoes`                         | `features/painel-opcoes/PainelDeOpcoes.tsx`         | sim: catalogo.produtos   | PT1, PT2, PT3      | T-11203 |
| `/painel/aparencia`                      | `features/config/FormularioAparencia.tsx`           | sim: personalizacao      | PT1, PT4           | T-11206 |
| `/painel/feed`                           | `features/feed-config/FormularioDoFeed.tsx`         | sim: feed                | PT1, PT4           | T-11211 |
| `/painel/stories`                        | `features/stories-painel/TelaDeStories.tsx`         | sim: catalogo.produtos   | PT1                | T-11211 |
| `/painel/comentarios`                    | `features/comentarios/TelaDeComentarios.tsx`        | sim: moderar_comentarios | PT1, PT3           | T-11211 |
| `/painel/config/contato`                 | `features/config/EditorDeMensagem.tsx`              | sim: configuracoes       | PT1, PT4           | T-11207 |
| `/painel/config/entrega`                 | `features/config/FormularioEntrega.tsx`             | sim: configuracoes       | PT1, PT4           | T-11207 |
| `/painel/config/horarios`                | `features/config/FormularioHorario.tsx`             | sim: configuracoes       | PT1, PT4           | T-11207 |
| `/painel/config/pagamento`               | `features/config/FormularioPagamento.tsx`           | sim: configuracoes       | PT1, PT4           | T-11207 |
| `/painel/config/impressao`               | `features/config/FormularioImpressao.tsx`           | sim: configuracoes       | PT1, PT4           | T-11207 |
| `/painel/equipe`                         | `features/equipe/PainelDaEquipe.tsx`                | sim: equipe              | PT1, PT3, PT5      | T-11209 |
| `/painel/ajuda`                          | `features/painel/EmConstrucaoDoPainel.tsx`          | não                      | PT1, PT6           | T-11201 |

Fora de `(painel)`, mas parte da jornada do dono: `/cadastrar` com
`features/auth/CadastroDeDono.tsx` (T-11210), `/escolher-loja` com
`features/equipe/CartaoDaLoja.tsx` e `/escolher-loja/nova` com
`features/equipe/FormularioOutraLoja.tsx` (T-11209), `features/aprovacao/`
(T-11210) e `features/tutorial/` (T-11210). A moldura (`layout.tsx`, menu,
`SemPermissao`, avisos) é da T-11201.

## 4. Padrões de tela PT1 a PT7

Rótulos deste documento, compartilhados com a administração para os dois
parecerem um produto só. Não são códigos do motor. Cada padrão usa peças da
base visual do #104; o que ainda não existe lá é pedido, nunca criado aqui.

| Padrão | Nome                        | Peça de hoje                                                                    | Peça da base visual                | Regra                                                                                                               |
| ------ | --------------------------- | ------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| PT1    | Cabeçalho de página         | títulos soltos em cada tela                                                     | tokens de tipografia               | título, descrição curta, ação principal à direita e ações secundárias em menu; ações passam por `pode()` (AC-11206) |
| PT2    | Barra de filtros            | `features/painel-filtros/BarraDeFiltros.tsx`, `.sc-filtros__chip`, `.sc-gaveta` | Chip e Gaveta                      | busca sempre visível; filtros ligados viram chips removíveis; no celular os filtros abrem na gaveta (AC-11221)      |
| PT3    | Tabela densa com ações      | `Tabela` (`noCelular="cartoes"`), `MenuSuspenso`, `Paginacao`                   | consumo, sem peça nova (ASM-11203) | computador: tabela com cabeçalho; celular: cartões com os mesmos campos e ações (AC-11218)                          |
| PT4    | Ficha ou formulário em abas | seções empilhadas e `Sanfona`                                                   | Abas                               | abas só para alternar painéis da mesma página; cada aba mantém seus campos e erros                                  |
| PT5    | Janela de confirmação       | `Dialogo` do pacote (não é modal de verdade) e `JanelaModal.tsx` do quadro      | Gaveta ou a correção do `Dialogo`  | foco preso, Esc fecha, foco volta ao gatilho; ver a nota abaixo                                                     |
| PT6    | Estados da tela             | mensagens próprias de cada lista, `SemPermissao`                                | Aviso, estados do pacote           | vazio, carregando, erro com nova tentativa e sem permissão (AC-11220)                                               |
| PT7    | Cartão de métrica           | `features/dashboard/CartoesDoPainel.tsx`, `VariacaoEmSeta.tsx`                  | tokens de cor e tipografia         | valor, rótulo e variação em texto com seta (AC-11239)                                                               |

**Nota sobre PT5.** A administração já tem uma janela modal própria
(`features/admin/JanelaDeConfirmacao.tsx`, com `showModal()`, foco preso e
Esc), criada porque o `Dialogo` do pacote não é modal. O painel não a importa:
ela é da administração. As confirmações do painel (remover produto, cancelar
pedido, remover ou desativar membro da equipe) esperam a resposta da base
visual sobre corrigir o `Dialogo` ou usar a Gaveta. Até lá, mantêm o
comportamento de hoje, e a tarefa que as migra fica bloqueada.

## 5. Permissões: o que o redesenho não pode mudar

### 5.1 Quem vê qual item do menu

Fonte: `features/painel/secoes-do-painel.ts` e `DA_EQUIPE` em
`packages/contracts/src/permissoes.ts`. É a tabela fixa que os testes futuros
usam (AC-11201 e AC-11202), revisada pelo dono do produto (ASM-11207).

| Seção      | Item                | Endereço                   | Permissão             | Dono | Equipe |
| ---------- | ------------------- | -------------------------- | --------------------- | ---- | ------ |
| Operação   | Início              | `/painel`                  | metricas              | sim  | sim    |
| Operação   | Pedidos             | `/painel/pedidos`          | pedidos.operar        | sim  | sim    |
| Operação   | Novo pedido         | `/painel/pedidos/novo`     | pedidos.manual        | sim  | sim    |
| Operação   | Clientes            | `/painel/clientes`         | clientes              | sim  | sim    |
| Operação   | Comentários         | `/painel/comentarios`      | moderar_comentarios   | sim  | sim    |
| Catálogo   | Produtos            | `/painel/produtos`         | catalogo.produtos     | sim  | sim    |
| Catálogo   | Categorias          | `/painel/categorias`       | catalogo.categorias   | sim  | sim    |
| Catálogo   | Estoque             | `/painel/estoque`          | catalogo.produtos     | sim  | sim    |
| Catálogo   | Variações           | `/painel/variacoes`        | catalogo.produtos     | sim  | sim    |
| Catálogo   | Opções e adicionais | `/painel/opcoes`           | catalogo.produtos     | sim  | sim    |
| Minha loja | Ver loja            | `/loja/<apelido>`          | loja.ver              | sim  | sim    |
| Minha loja | Aparência           | `/painel/aparencia`        | personalizacao        | sim  | não    |
| Minha loja | Feed                | `/painel/feed`             | feed                  | sim  | não    |
| Minha loja | Stories             | `/painel/stories`          | catalogo.produtos     | sim  | sim    |
| Minha loja | Contato             | `/painel/config/contato`   | configuracoes         | sim  | não    |
| Minha loja | Entrega             | `/painel/config/entrega`   | configuracoes         | sim  | não    |
| Minha loja | Horários            | `/painel/config/horarios`  | configuracoes         | sim  | não    |
| Minha loja | Pagamento           | `/painel/config/pagamento` | configuracoes         | sim  | não    |
| Minha loja | Impressão           | `/painel/config/impressao` | configuracoes         | sim  | não    |
| Equipe     | Equipe e acessos    | `/painel/equipe`           | equipe                | sim  | não    |
| Conta      | Minha conta         | `/conta`                   | livre                 | sim  | sim    |
| Conta      | Trocar de loja      | `/escolher-loja`           | livre (se tem outras) | sim  | sim    |
| Conta      | Ajuda               | `/painel/ajuda`            | livre                 | sim  | sim    |
| Conta      | Ver tutorial        | `/painel?tutorial=1`       | livre                 | sim  | sim    |

Atalhos do celular (`ATALHOS_DO_CELULAR`): Início, Pedidos, Novo pedido e
Produtos, cada um só se a pessoa tem a permissão. As seções "Minha loja" e
"Equipe" aparecem para a equipe só com os itens permitidos; "Equipe" some. A
administração pode desligar uma seção de configuração (`secoesDesligadas`,
hoje a impressão).

### 5.2 Guardas e controles internos

- Rotas guardadas no servidor: config, aparência, equipe, feed, comentários,
  estoque, variações, opções e stories (mapa da seção 3). Para a equipe, só
  as quatro primeiras negam; as outras exigem `catalogo.produtos`, que ela
  tem. Os testes de "área negada" usam por isso config, aparência, equipe e
  feed, e simulam uma lista reduzida sem `moderar_comentarios` para comentários
  (AC-11203).
- Rotas sem guarda de layout (a API é a única barreira): `/painel`,
  métricas, produtos e subpáginas, categorias e especificações, pedidos e
  subpáginas, clientes e subpáginas, ajuda. Hoje a equipe tem todas essas
  permissões, então não há efeito; vira risco se houver permissão por membro
  (Q-11204, ASM-11208).
- Controles internos condicionados: `app/(painel)/painel/stories/page.tsx`
  (`podeTrocarFoto`, exige personalização) e
  `app/(painel)/painel/comentarios/page.tsx` (`podeConfigurar`, exige
  configurações) (AC-11204).
- O link "Configurar" de `features/config/AvisosPendentes.tsx` é montado sem
  `pode()` e aparece à equipe (Q-11207).
- Oráculo (AC-11207): para cada item cujo endereço está em `/painel`, a
  permissão do item é igual a `permissaoDoCaminho(endereco)`, ignorando a
  query string; e cada `GuardaDoPainel permissao=` do layout bate com
  `permissaoDoCaminho` da rota. "Ver loja" e as rotas fora do painel ficam fora
  do oráculo.

### 5.3 Onde os dados são buscados

Os layouts acima da guarda (`app/(painel)/painel/layout.tsx`,
`MolduraDaConfiguracao`) não leem dado de área com permissão. A busca fica na
página ou no cliente, e a API recusa (AC-11205). Prova futura: renderizar a
página de uma área negada para a equipe e conferir que o HTML não traz campo
da área.

## 6. Cor, tema e densidade

### 6.1 Cor

- A cor do painel é a do SimpleClick (`--cor-primaria`, `#B7FF00`), com texto
  escuro sobre o verde (P-102 e P-106). Nenhum verde novo.
- A cor de destaque da loja vale só dentro da prévia da aparência (quadros com
  a vitrine real), por `TemaDaMarca`. A moldura e os botões do painel nunca
  usam `--cor-marca` (AC-11229).
- Tokens novos só pela fonte única (P-108). Se as cores das etapas do pedido
  precisarem de tokens semânticos, o pedido vai à base visual (AC-11247).

### 6.2 Tema (Q-11202)

| Alternativa | O que muda                                           | Impacto                                                                                              |
| ----------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A (padrão)  | painel claro, menu escuro, segue o sistema como hoje | zero risco de contraste novo; o tutorial continua funcionando; é o que vale enquanto não há resposta |
| B           | painel escuro do Stitch                              | refazer contraste de tabelas, gráficos e etapas; cobrir os dois temas nos testes                     |
| C           | seguir o sistema com alternador na conta             | peça nova (alternador) e persistência: pedido à base visual                                          |

Em qualquer alternativa, o tutorial deixa de depender de `data-tema` para achar
o menu (AC-11237).

### 6.3 Densidade (Q-11205)

- Padrão proposto: linha de tabela densa no computador, com alvo de toque
  adequado só para o que é clicável no celular (cartões). A altura final
  depende da resposta sobre o alvo de toque da base visual.
- Telas de operação mostram mais informação por tela que o catálogo do
  cliente: tabela e quadro, sem grade de cartões de produto.

## 7. Prévia da aparência

Fluxo atual, que o redesign preserva:

1. `FormularioAparencia` gera o rascunho (`RascunhoDaVitrine`) e grava o
   cookie `sc_previa` com `codificarRascunho` (caminho restrito às páginas
   de prévia da loja, 600 s).
2. `PreviaDaLojaReal` mostra dois quadros: a vitrine e o cardápio, em 1280px
   (computador) e 390px (celular), reduzidos por escala, sem clique e sem foco.
3. A rota de prévia (`app/(loja)/loja/[slug]/previa/[parte]/page.tsx`) lê o
   rascunho (`rascunhoDoPedido`, `lerRascunho`), aplica na vitrine
   (`resultadoComRascunho`) e monta as telas reais da loja. É gerada a cada
   pedido e pede não indexar. Essa rota é da vitrine e do catálogo, não deste
   card (ASM-11204).
4. Nada é gravado até o lojista salvar.

Defesas que o redesign mantém (AC-11230 a AC-11232): lista fechada de campos;
cor só por `ehCorHexadecimal`; imagem só por `ehEnderecoDeImagem`; apelido
conferido; sem HTML a partir do nome do rascunho; rascunho fora da query
string e de mensagens entre janelas. Perguntas de segurança fora do visual:
Q-11211 e Q-11212.

Dependência: a prévia só mostra o resultado final do redesign depois que a
vitrine e o catálogo da loja forem redesenhados; por isso a tarefa da prévia
espera as tarefas desses cards.

## 8. Cupom impresso

`features/impressao/FolhaDoCupom.tsx` e `BotaoImprimirCupom.tsx` geram a folha
de impressão. O redesign do painel não pode alterar a folha: fundo branco,
texto preto, sem tokens de tema da tela (AC-11226). Prova futura: teste que
confere que a folha não depende de `data-tema` nem de variáveis de cor.

## 9. Matriz critério → prova futura

Todos os testes são `*.onp.test.ts(x)` com `[CA-n] @spec:AC-112xx`, em
`apps/web/tests/` ou ao lado do código. "e2e" é proposta ao #114 (o
`onp-spec verify` só roda o vitest).

| Critério            | Prova futura                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| AC-11201, AC-11202  | vitest: `secoesDoPainel` contra a tabela da seção 5.1, para dono, equipe e seção desligada         |
| AC-11203            | vitest: renderizar as quatro áreas guardadas como equipe e conferir o aviso e a ausência de campos |
| AC-11204            | vitest: stories e comentários sem as permissões, sem o botão                                       |
| AC-11205            | vitest: layouts acima da guarda sem leitura de dado de área                                        |
| AC-11206            | vitest: varrer links do menu, atalhos, cabeçalhos e avisos com e sem permissão                     |
| AC-11207            | vitest: oráculo `permissaoDoCaminho` contra itens e guardas                                        |
| AC-11208            | vitest: sem permissão, nenhuma chamada de rede do contador                                         |
| AC-11209            | vitest: nomes acessíveis e Esc na gaveta; e2e: 344, 768 e 1280px sem rolagem lateral               |
| AC-11210            | vitest: ordem dos avisos no layout                                                                 |
| AC-11211            | vitest: itens e contador do menu da administração                                                  |
| AC-11212            | vitest: troca de loja sem dado da anterior; sem cache no cliente sem chave por loja                |
| AC-11213 a AC-11217 | vitest: uma lista por critério com os testes legados como referência                               |
| AC-11218            | vitest: `<table>` no computador; e2e: cartões e sem rolagem lateral em 344px                       |
| AC-11219            | vitest: lista de clientes e cartão do quadro só com os campos de hoje                              |
| AC-11220            | vitest: estados vazio, carregando, erro e 403                                                      |
| AC-11221            | vitest: foco preso, Esc e devolução na gaveta de filtros; chips removíveis                         |
| AC-11222 a AC-11225 | vitest: quadro, aviso sonoro, pedido manual e detalhe (testes legados como referência)             |
| AC-11226            | vitest: a folha do cupom não usa tema nem cor da tela                                              |
| AC-11227 a AC-11233 | vitest: prévia, rascunho, cookie, `lerRascunho` e a página de prévia; e2e: dois quadros            |
| AC-11234 a AC-11238 | vitest: cadastro, senhas, aprovação, alvos do tutorial por largura                                 |
| AC-11239 a AC-11245 | vitest: métricas, equipe, config, produto, ficha, feed e ajuda                                     |
| AC-11246 a AC-11248 | vitest: varredura de cores literais e padrões proibidos nos `.tsx` do painel                       |
| AC-11249            | e2e: contraste renderizado e foco, proposto ao #114                                                |
| AC-11250            | vitest: nenhuma mudança de tema ou de menu escuro enquanto a pergunta está aberta                  |

## 10. Donos de arquivo e filas

A execução futura é uma tarefa após a outra, na pasta principal, sem
worktrees. O painel espera as tarefas da base visual (chip, gaveta e abas)
antes das tarefas de lista.

| Arquivo ou pasta                                                                                                                                                                                                                             | Dono ou fila                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `features/painel/*` (inclui `MenuLateral.tsx` e `MenuDaAdministracao.tsx`)                                                                                                                                                                   | este card; depois a administração, por pedido                                                      |
| `features/painel-filtros/*`, `features/painel-estoque/lista-paginada.tsx`                                                                                                                                                                    | este card; a administração usa, não edita                                                          |
| `packages/ui/styles/filtros.css`                                                                                                                                                                                                             | este card (migra chip e gaveta para as peças novas)                                                |
| `packages/ui/styles/pedidos.css`                                                                                                                                                                                                             | este card: pedidos e clientes em sequência                                                         |
| `packages/ui/styles/cadastro.css`                                                                                                                                                                                                            | este card: cadastro e aprovação em sequência                                                       |
| `packages/ui/styles/stories.css`                                                                                                                                                                                                             | fila: base visual, depois início e descoberta, depois este card                                    |
| `features/dashboard/*`, `features/config/*`, `features/painel-*`, `features/equipe/*`                                                                                                                                                        | este card                                                                                          |
| `features/aprovacao/*`, `features/tutorial/*`, `features/auth/CadastroDeDono*`, `features/comentarios/*`, `features/stories-painel/*`, `features/feed-config/*`, `features/impressao/*`, `app/(painel)/**`, `app/_painel/GuardaDoPainel.tsx` | sem dono na tabela do planejamento: Q-11208; tratados como deste card até a resposta, sem presumir |
| `app/(conta)/cadastrar/page.tsx`                                                                                                                                                                                                             | fronteira com a área do cliente: Q-11208                                                           |
| `app/(loja)/loja/[slug]/previa/[parte]/page.tsx` e `server/previa.ts`                                                                                                                                                                        | vitrine e catálogo; este card só pede ajuste                                                       |
| Peças novas e tokens em `packages/ui`                                                                                                                                                                                                        | base visual (#104); este card só pede                                                              |
| Testes `*.onp.test.ts(x)` deste card; e2e de larguras e contraste                                                                                                                                                                            | este card os próprios; e2e transversais com o #114                                                 |

Regra: este card não edita arquivo da base visual. Quando faltar peça ou
token, pede por `board_message` e espera a vez.
