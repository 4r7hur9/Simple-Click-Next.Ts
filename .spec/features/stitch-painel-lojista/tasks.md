# Tarefas: Expansão visual para o painel do lojista

> feature: stitch-painel-lojista

<!--
  Card #112. Todas pendentes: implementação NÃO autorizada.
  Execução futura: uma tarefa após a outra, na pasta principal, sem worktree
  (várias compartilham pedidos.css, cadastro.css, filtros.css e
  lista-paginada.tsx). Testes só *.onp.test.ts(x) com título
  "[CA-n] @spec:AC-112xx …". Nenhuma tarefa depende de função "A decidir".
  Campo "Arquivos" só com caminhos que já existem; o que será criado vai na
  linha "A criar" (o motor a ignora). Dependências de outros cards são escritas
  por extenso, sem o código deles.
-->

## Perguntas que bloqueiam tarefas

| Pergunta | Bloqueia                           | O que fica parado                                          |
| -------- | ---------------------------------- | ---------------------------------------------------------- |
| Q-11201  | todas                              | o alcance sem mockup: nada começa sem essa aprovação       |
| Q-11202  | T-11201, T-11210                   | tema do painel e do menu; o seletor do menu no tutorial    |
| Q-11203  | todas                              | a ordem de execução (a proposta é a ordem numérica abaixo) |
| Q-11204  | nenhuma                            | guardas novas são outro card; o redesign não as adiciona   |
| Q-11205  | T-11202, T-11203, T-11204          | altura da linha da tabela                                  |
| Q-11206  | T-11201                            | fonte do painel (os nomes dos tokens não dependem dela)    |
| Q-11207  | T-11201                            | se o "Configurar" dos avisos some para a equipe            |
| Q-11208  | T-11205, T-11209, T-11210, T-11211 | quem edita os arquivos sem dono na tabela do planejamento  |
| Q-11209  | T-11204                            | se a busca de cliente continua no endereço da página       |
| Q-11210  | T-11204                            | máscara do telefone nas telas de balcão                    |
| Q-11211  | T-11206                            | atributo Secure e limpeza do cookie da prévia              |
| Q-11212  | nenhuma                            | proteção contra embutir o painel é outro card              |

## T-11201 — Moldura, menu, avisos e estados sem permissão [pendente]

- Refs: US-11201, AC-11201, AC-11202, AC-11203, AC-11204, AC-11205, AC-11206, AC-11207, AC-11208, AC-11209, AC-11210, AC-11211, AC-11212, AC-11220, AC-11245, AC-11250
- Arquivos: apps/web/src/app/(painel)/painel/layout.tsx, apps/web/src/features/painel/MenuLateral.tsx, apps/web/src/features/painel/MenuDoPainel.tsx, apps/web/src/features/painel/SecaoDoMenu.tsx, apps/web/src/features/painel/CabecalhoDaLoja.tsx, apps/web/src/features/painel/PessoaDoMenu.tsx, apps/web/src/features/painel/SairDoMenu.tsx, apps/web/src/features/painel/SemPermissao.tsx, apps/web/src/features/painel/EmConstrucaoDoPainel.tsx, apps/web/src/features/painel/estilo-do-menu.ts, apps/web/src/features/painel/secoes-do-painel.ts, apps/web/src/features/painel/tipos-do-menu.ts, apps/web/src/features/config/AvisoDeSuspensao.tsx, apps/web/src/features/config/AvisosPendentes.tsx, apps/web/src/app/_painel/GuardaDoPainel.tsx
- A criar: apps/web/tests/painel-lojista-moldura.onp.test.tsx
- Depende de: tokens e peças da base visual (fonte, tema e botões)
- Aplica os tokens e as peças ao menu lateral e à moldura, sem mudar quem vê
  o quê. Os testes comparam o menu com a tabela papel → itens do design.md e
  rodam o oráculo `permissaoDoCaminho`.
- Garante a não regressão do menu da administração (AC-11211) antes de
  liberar os arquivos comuns ao card da administração.
- Preserva `data-tema` do menu enquanto a Q-11202 está aberta (AC-11250).

## T-11202 — Padrões PT2 e PT3: filtros, chips, gaveta e paginação [pendente]

- Refs: US-11202, AC-11218, AC-11220, AC-11221
- Arquivos: apps/web/src/features/painel-filtros/BarraDeFiltros.tsx, apps/web/src/features/painel-estoque/lista-paginada.tsx, packages/ui/styles/filtros.css
- A criar: apps/web/tests/painel-lojista-listas.onp.test.tsx
- Depende de: T-11201 e das peças Chip e Gaveta da base visual
- Troca `.sc-filtros__chip` e `.sc-gaveta` pelas peças da base visual,
  mantendo busca, filtros no endereço, volta à página 1 e foco da gaveta.
  `useConsultaNaUrl` e `Paginacao` mantêm o contrato.

## T-11203 — Catálogo: listas, formulários e subpáginas [pendente]

- Refs: US-11202, US-11206, AC-11213, AC-11215, AC-11216, AC-11217, AC-11218, AC-11219, AC-11220, AC-11242
- Arquivos: apps/web/src/features/painel-catalogo/ListaProdutos.tsx, apps/web/src/features/painel-catalogo/ListaCategorias.tsx, apps/web/src/features/painel-catalogo/FormularioProduto.tsx, apps/web/src/features/painel-catalogo/AjusteDeEstoque.tsx, apps/web/src/features/painel-catalogo/GradeDeVariacoes.tsx, apps/web/src/features/painel-catalogo/EditorGrupoOpcao.tsx, apps/web/src/features/painel-catalogo/EditorEspecificacoes.tsx, apps/web/src/features/painel-catalogo/LinhasDePreco.tsx, apps/web/src/features/painel-catalogo/EnvioDeImagem.tsx, apps/web/src/features/painel-catalogo/CamposDeEspecificacao.tsx, apps/web/src/features/painel-catalogo/BlocosPorRamo.tsx, apps/web/src/features/painel-estoque/PainelDeEstoque.tsx, apps/web/src/features/painel-estoque/Indicadores.tsx, apps/web/src/features/painel-variacoes/PainelDeVariacoes.tsx, apps/web/src/features/painel-opcoes/PainelDeOpcoes.tsx
- A criar: apps/web/tests/painel-lojista-catalogo.onp.test.tsx
- Depende de: T-11202
- Cada lista mantém o que tem hoje (50 por página em produtos, sem página em
  categorias, sem ordenação em variações e opções). A confirmação de remover
  fica como está até a resposta da base visual sobre o `Dialogo`.

## T-11204 — Clientes: lista, ficha e importação [pendente]

- Refs: US-11202, US-11206, AC-11214, AC-11218, AC-11219, AC-11220, AC-11243
- Arquivos: apps/web/src/features/painel-clientes/ListaClientes.tsx, apps/web/src/features/painel-clientes/FichaCliente.tsx, apps/web/src/features/painel-clientes/FormularioCliente.tsx, apps/web/src/features/painel-clientes/HistoricoCliente.tsx, apps/web/src/features/painel-clientes/importacao/ImportadorDeClientes.tsx, apps/web/src/features/painel-clientes/importacao/PassoDaRevisao.tsx, apps/web/src/features/painel-clientes/importacao/PassoDoArquivo.tsx, apps/web/src/features/painel-clientes/importacao/PassoDoMapeamento.tsx, apps/web/src/features/painel-clientes/importacao/PassoDoResultado.tsx, packages/ui/styles/pedidos.css
- A criar: apps/web/tests/painel-lojista-clientes.onp.test.tsx
- Depende de: T-11202
- `pedidos.css` é compartilhado com a T-11205: esta tarefa mexe só nas
  classes da ficha e da lista de clientes, e roda antes da T-11205.
- A lista mostra só nome, telefone, pedidos, total e último pedido. A busca
  no endereço e a máscara do telefone esperam as respostas da Q-11209 e da
  Q-11210.

## T-11205 — Pedidos: quadro, pedido manual, detalhe, som e impressão [pendente]

- Refs: US-11203, AC-11219, AC-11222, AC-11223, AC-11224, AC-11225, AC-11226, AC-11247
- Arquivos: apps/web/src/features/painel-pedidos/QuadroKanban.tsx, apps/web/src/features/painel-pedidos/CartaoDoKanban.tsx, apps/web/src/features/painel-pedidos/ColunaDoKanban.tsx, apps/web/src/features/painel-pedidos/AcoesDeStatus.tsx, apps/web/src/features/painel-pedidos/AvisoSonoro.tsx, apps/web/src/features/painel-pedidos/DetalheDoPedido.tsx, apps/web/src/features/painel-pedidos/EscolherCliente.tsx, apps/web/src/features/painel-pedidos/EstadoDoAgente.tsx, apps/web/src/features/painel-pedidos/JanelaDoPedido.tsx, apps/web/src/features/painel-pedidos/JanelaModal.tsx, apps/web/src/features/painel-pedidos/MontarPedido.tsx, apps/web/src/features/painel-pedidos/SeletorDoDia.tsx, apps/web/src/features/painel-pedidos/SeloAguardando.tsx, apps/web/src/features/painel-pedidos/SeloDeStatus.tsx, apps/web/src/features/painel-pedidos/quadro.css, apps/web/src/features/impressao/FolhaDoCupom.tsx, apps/web/src/features/impressao/BotaoImprimirCupom.tsx, packages/ui/styles/pedidos.css
- A criar: apps/web/tests/painel-lojista-pedidos.onp.test.tsx
- Depende de: T-11204 (arquivo compartilhado `pedidos.css`) e do token das etapas pedido à base visual
- Etapa e tipo em texto, não só em cor. A folha do cupom não herda tema nem
  cor da tela. As cores literais das etapas viram tokens ou a exceção é
  registrada no design.md.

## T-11206 — Aparência e prévia [pendente]

- Refs: US-11204, AC-11227, AC-11228, AC-11229, AC-11230, AC-11231, AC-11232, AC-11233
- Arquivos: apps/web/src/features/config/FormularioAparencia.tsx, apps/web/src/features/config/PreviaDaLojaReal.tsx, apps/web/src/features/config/SeletorDeCor.tsx, apps/web/src/features/config/EnvioDeImagem.tsx, apps/web/src/features/config/ContextoDaFoto.tsx, apps/web/src/features/config/cor-da-imagem.ts, apps/web/src/features/feed-config/PreviaNoFeed.tsx, packages/ui/styles/seletor-de-cor.css
- A criar: apps/web/tests/painel-lojista-aparencia.onp.test.tsx
- Depende de: T-11201 e das tarefas do redesign da vitrine e do catálogo da loja
- Não edita a rota de prévia nem `server/previa.ts` (dono: vitrine e
  catálogo). Os testes cobrem `lerRascunho`, o cookie, os quadros sem clique e
  a cor da loja só dentro da prévia. Secure e limpeza do cookie esperam a
  Q-11211.

## T-11207 — Configurações da loja [pendente]

- Refs: US-11206, AC-11241
- Arquivos: apps/web/src/features/painel/MolduraDaConfiguracao.tsx, apps/web/src/features/config/NavegacaoDaConfiguracao.tsx, apps/web/src/features/config/secoes.ts, apps/web/src/features/config/useSecao.ts, apps/web/src/features/config/EditorDeMensagem.tsx, apps/web/src/features/config/FormularioEntrega.tsx, apps/web/src/features/config/FormularioHorario.tsx, apps/web/src/features/config/FormularioPagamento.tsx, apps/web/src/features/config/FormularioImpressao.tsx, apps/web/src/features/config/ParearAgente.tsx, apps/web/src/features/config/RotuloComInfo.tsx, apps/web/src/features/config/ErroDoCampo.tsx
- A criar: apps/web/tests/painel-lojista-config.onp.test.tsx
- Depende de: T-11201
- Mantém validações, mensagens e o pareamento do agente de impressão. A
  navegação segue `navegacaoVisivel`.

## T-11208 — Métricas e início [pendente]

- Refs: US-11206, AC-11239
- Arquivos: apps/web/src/features/dashboard/InicioDoPainel.tsx, apps/web/src/features/dashboard/MetricasPorPeriodo.tsx, apps/web/src/features/dashboard/PainelDeMetricas.tsx, apps/web/src/features/dashboard/CartoesDoPainel.tsx, apps/web/src/features/dashboard/VariacaoEmSeta.tsx, apps/web/src/features/dashboard/GraficoDeBarras.tsx, apps/web/src/features/dashboard/EvolucaoDiaria.tsx, apps/web/src/features/dashboard/DistribuicaoPorHora.tsx, apps/web/src/features/dashboard/ComposicaoDasVendas.tsx, apps/web/src/features/dashboard/DivisaoDasVendas.tsx, apps/web/src/features/dashboard/RankingProdutos.tsx, apps/web/src/features/dashboard/PedidosAgora.tsx, apps/web/src/features/dashboard/SeletorDePeriodo.tsx, apps/web/src/features/dashboard/AlternarMedida.tsx, apps/web/src/features/dashboard/HorarioDeReferencia.tsx, apps/web/src/features/dashboard/BotaoExportar.tsx, apps/web/src/features/dashboard/PainelVazio.tsx
- A criar: apps/web/tests/painel-lojista-metricas.onp.test.tsx
- Depende de: T-11201
- Valor e variação em texto com seta; resumo em texto dos gráficos; período
  no endereço; releitura a cada 60 segundos.

## T-11209 — Equipe e escolha de loja [pendente]

- Refs: US-11201, US-11206, AC-11212, AC-11235, AC-11240
- Arquivos: apps/web/src/features/equipe/PainelDaEquipe.tsx, apps/web/src/features/equipe/CartaoDaLoja.tsx, apps/web/src/features/equipe/FormularioOutraLoja.tsx
- A criar: apps/web/tests/painel-lojista-equipe.onp.test.tsx
- Depende de: T-11201 e da resposta da base visual sobre a janela de confirmação
- Senhas mantêm tipo e preenchimento automático. Confirmações de desativar e
  remover esperam a decisão do `Dialogo`.

## T-11210 — Cadastro do dono, aprovação e tutorial [pendente]

- Refs: US-11205, AC-11234, AC-11235, AC-11236, AC-11237, AC-11238
- Arquivos: apps/web/src/features/auth/CadastroDeDono.tsx, apps/web/src/features/aprovacao/TelaDeAprovacao.tsx, apps/web/src/features/aprovacao/AcoesDaAprovacao.tsx, apps/web/src/app/(painel)/painel/_aprovacao/TelaDeAprovacaoDaLoja.tsx, apps/web/src/features/tutorial/Tutorial.tsx, apps/web/src/features/tutorial/passos.ts, apps/web/src/features/tutorial/tutorial.css, packages/ui/styles/cadastro.css
- A criar: apps/web/tests/painel-lojista-primeiros-passos.onp.test.tsx
- Depende de: T-11201 e das respostas da Q-11202 e da Q-11208
- O tutorial deixa de achar o menu por `data-tema` e passa a usar um alvo
  próprio. `cadastro.css` é compartilhado entre cadastro e aprovação: as duas
  partes são feitas nesta tarefa, em sequência. A página `/cadastrar` fica
  fora até a Q-11208 responder.

## T-11211 — Feed, stories e comentários [pendente]

- Refs: US-11206, AC-11204, AC-11244
- Arquivos: apps/web/src/features/feed-config/FormularioDoFeed.tsx, apps/web/src/features/stories-painel/TelaDeStories.tsx, apps/web/src/features/comentarios/TelaDeComentarios.tsx, packages/ui/styles/stories.css
- A criar: apps/web/tests/painel-lojista-conteudo.onp.test.tsx
- Depende de: T-11201 e das tarefas de início e descoberta que mexem em `stories.css`
- Mantém `podeTrocarFoto` e `podeConfigurar` como condição dos controles.

## T-11212 — Testes transversais de consistência [pendente]

- Refs: US-11207, AC-11246, AC-11247, AC-11248, AC-11249, AC-11250
- Arquivos: apps/web/src/features/config/SeletorDeCor.tsx
- A criar: apps/web/tests/painel-lojista-consistencia.onp.test.ts
- Depende de: T-11201 a T-11211
- Varre os `.tsx` do painel atrás de cor literal (exceto o seletor de cor),
  do verde `#b2f800`, de recurso externo, de dados do Stitch e de texto
  veicular. Contraste renderizado e foco ficam num e2e proposto ao #114.
