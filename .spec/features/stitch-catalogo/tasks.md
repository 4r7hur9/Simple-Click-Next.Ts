# Tasks: Catálogo responsivo com filtros e espaço para a sacola

> feature: stitch-catalogo

<!--
  Card #108 — bloco de códigos 10801 a 10899.
  Nada aqui está aprovado para implementação: todas as tarefas ficam
  [pendente], sem auto_start, e dependem de plano aprovado. Execução futura:
  uma tarefa após a outra, na pasta principal, sem worktrees e sem o executor
  paralelo do motor. Nenhuma tarefa depende de função "A decidir" (P-107).
  "Arquivos" lista só caminhos que já existem; os arquivos novos estão na
  linha "A criar", que o motor ignora. Proposta técnica em design.md.
  Antes de editar TelaDoCatalogo.tsx e vitrine.css, confira a fila de donos
  (design.md, seção 6) e os claims do board.
-->

## Perguntas que bloqueiam tarefas

| Pergunta | Bloqueia | O que muda se a resposta mudar                              |
| -------- | -------- | ----------------------------------------------------------- |
| Q-10801  | T-10804  | lista de uma coluna ou grade de duas colunas no celular     |
| Q-10802  | T-10803  | só os filtros de hoje, ou com "em estoque" e faixa de preço |
| Q-10802  | T-10808  | a tarefa só existe se houver filtro novo                    |
| Q-10803  | T-10801  | sacola do tablet em barra fixa ou em coluna lateral         |
| Q-10804  | T-10801  | ponto de quebra das três zonas                              |
| Q-10805  | T-10804  | botões de quantidade no cartão                              |
| Q-10806  | T-10808  | a tarefa só existe se houver ordenação nova                 |
| Q-10807  | T-10808  | a tarefa só existe se o estoque for mostrado                |
| Q-10811  | T-10806  | texto do link de saída e teste legado a atualizar           |
| Q-10812  | T-10803  | filtros mantidos ou descartados ao trocar de categoria      |
| Q-10813  | T-10802  | categorias em lista lateral ou em faixa de chips            |

## T-10801 — Três zonas, região da sacola e reserva de altura [pendente]

- Refs: US-10802, AC-10807, AC-10808, AC-10809, AC-10810, AC-10811
- Arquivos: apps/web/src/app/(loja)/loja/[slug]/cardapio/TelaDoCatalogo.tsx, packages/ui/styles/vitrine.css
- A criar: apps/web/tests/catalogo-layout.onp.test.tsx
- Modelo: claude-opus-5-5
- Esforço: alto
- Moldura do catálogo em grade de 12 colunas: categorias e filtros (3),
  produtos (6, ou 9 sem sacola) e a região `.sc-catalogo__sacola` (3), a
  partir da largura escolhida em Q-10804. Abaixo dela, a página é uma coluna e
  o tablet segue Q-10803. Reserva de altura (`padding-bottom` e
  `env(safe-area-inset-bottom)`) para a barra fixa de baixo.
- O conteúdo da região é do #110. Esta tarefa só entrega a região vazia e as
  regras que impedem salto de layout. A coluna vazia segue o critério do #110.
- Teste: estrutura da região e regras de grade e de quebra lidas do
  `vitrine.css`. Larguras reais e CLS: #114.

## T-10802 — Categorias com contagem [pendente]

- Refs: US-10801, AC-10803, AC-10805
- Arquivos: apps/web/src/features/vitrine/AbasDeCategoria.tsx, apps/web/src/lib/catalogo.ts, apps/web/src/server/catalogo-na-tela.ts, packages/ui/styles/vitrine.css
- A criar: nenhum (o teste fica em apps/web/tests/catalogo-paginacao.onp.test.tsx, criado na T-10805)
- Depende de: T-10801
- Modelo: claude-opus-5-5
- Esforço: medio
- `AbaDeCategoria` ganha o total (campo opcional) a partir do total da seção
  que o resumo já traz; com busca valendo, o total é o de acertos. Chip de
  categoria com `aria-current` (Chip do #104 ou classe atual). Mantém a regra
  de esconder a faixa com duas ou menos categorias.
- Lista lateral ou faixa de chips conforme Q-10813. A TV também lê a lista de
  abas: conferir que o campo novo não a quebra.

## T-10803 — Filtros em gaveta e em barra lateral, com chips ativos [pendente]

- Refs: US-10803, AC-10812, AC-10813, AC-10814, AC-10815, AC-10816, AC-10817
- Arquivos: apps/web/src/features/vitrine/BarraDeCatalogo.tsx, apps/web/src/features/vitrine/FiltroEspecificacao.tsx, apps/web/src/app/(loja)/loja/[slug]/cardapio/TelaDoCatalogo.tsx, apps/web/src/server/catalogo-na-tela.ts, packages/ui/styles/vitrine.css
- A criar: apps/web/tests/catalogo-filtros.onp.test.tsx
- Depende de: T-10801, T-10802
- Modelo: claude-opus-5-5
- Esforço: alto
- Evolui a gaveta que a barra já tem (popover `sc-painel--ajustes`, com o chip
  "Atacado"); não cria uma segunda cópia. No computador, o mesmo conteúdo vai
  para a barra lateral com um só formulário por largura (ids únicos), e o
  painel "Filtrar" fica desligado nessa largura.
- Chips dos filtros ligados com "x" e nome acessível; contagem de itens
  encontrados. Lateral sem especificações mostra só categorias, atacado e
  ordem (ou some, conforme Q-10802).
- Troca de categoria: comportamento de hoje (descarta os filtros) até a
  resposta de Q-10812.
- Teste: um formulário por largura, nenhum `id` repetido, foco devolvido ao
  botão ao fechar a gaveta, chips que removem só o próprio filtro.

## T-10804 — Cartão em lista e em grade, preços e estados [pendente]

- Refs: US-10802, US-10804, AC-10806, AC-10807, AC-10818, AC-10819, AC-10820, AC-10821, AC-10822
- Arquivos: apps/web/src/features/vitrine/CartaoDeProduto.tsx, apps/web/src/features/vitrine/GradeDeProdutos.tsx, apps/web/src/features/vitrine/CartaoEsgotado.tsx, packages/ui/styles/vitrine.css
- A criar: apps/web/tests/catalogo-cartao.onp.test.tsx
- Depende de: T-10801
- Modelo: claude-opus-5-5
- Esforço: alto
- Lista de uma coluna no celular e grade de duas ou três colunas no tablet e
  no computador (Q-10801). Troca o `sizes` da imagem
  (hoje `(max-width: 540px) 50vw, 320px`) e a proporção de
  `.sc-vitrine__moldura` para a foto pequena da lista.
- Preço, preço anterior riscado com texto para leitor de tela, linha de
  atacado (`chamadaDoAtacado`, sem alterá-la), o convite a escolher (texto do #109) sem inventar "a partir de", selos "Esgotado" e "Fora do horário" em texto. Sem número de
  estoque (Q-10807).
- Mantém `data-adicionar-produto` e `data-abre-produto`. Se Q-10805 aprovar os
  botões de quantidade, só para produto simples, reusando `eProdutoSimples`, e
  avisar o #109.
- Não edita `lib/atacado-na-vitrine.ts` nem `features/produto/*` (#109).

## T-10805 — Páginas, "Ver mais" e busca no servidor [pendente]

- Refs: US-10801, AC-10801, AC-10802, AC-10804, AC-10826
- Arquivos: apps/web/src/features/vitrine/MaisProdutos.tsx, apps/web/src/app/(loja)/loja/[slug]/cardapio/TelaDoCatalogo.tsx, apps/web/src/app/(loja)/loja/[slug]/cardapio/acoes.ts
- A criar: apps/web/tests/catalogo-paginacao.onp.test.tsx
- Depende de: T-10803
- Modelo: claude-opus-5-5
- Esforço: medio
- Preserva 24 produtos por seção, até 72 na primeira tela, página de até 48
  por requisição e cursor opaco. Texto do botão com o que falta; rolagem
  automática ou botão conforme Q-10810.
- Erro: mantém os itens, mostra "Tentar de novo", anuncia por `aria-live` e não
  repete a tentativa sozinho. Endereço guarda busca, categoria, filtros,
  atacado e ordem.
- Teste com dublê da API: cursor sem repetir produto, nenhuma chamada que peça
  o catálogo inteiro, funcionamento por links e formulários GET.

## T-10806 — Estados vazios: busca, filtro sem acerto e categoria [pendente]

- Refs: US-10805, AC-10823, AC-10824, AC-10825
- Arquivos: apps/web/src/features/vitrine/BuscaProduto.tsx, apps/web/src/server/catalogo-na-tela.ts, apps/web/src/app/(loja)/loja/[slug]/cardapio/TelaDoCatalogo.tsx, apps/web/tests/vitrine-busca.test.tsx
- A criar: apps/web/tests/catalogo-vazios.onp.test.tsx
- Depende de: T-10805
- Modelo: claude-opus-5-5
- Esforço: alto
- Corrige a falha confirmada: filtro de especificação sem acerto (sem busca e
  sem atacado) deixa de cair em `lojaSemCatalogo` e na mensagem "categoria não
  existe mais"; mostra "Nenhum produto com esse filtro", mantém a barra e
  oferece "Limpar filtros".
- Vazio de busca em qualquer largura, com o termo preenchido e o link de
  saída. O texto do link segue Q-10811; se mudar, atualizar de propósito
  `apps/web/tests/vitrine-busca.test.tsx` e listar a alteração.
- Categoria inexistente continua sem 404, com "Ver o catálogo inteiro".

## T-10807 — Título, topo curto, textos genéricos e regressão [pendente]

- Refs: US-10806, US-10807, AC-10827, AC-10828, AC-10829, AC-10830, AC-10831
  \1, apps/web/src/features/vitrine/CapaDaVitrine.tsx, apps/web/tests/capa-do-catalogo.test.tsx, apps/web/src/features/vitrine/BarraDeCatalogo.tsx, apps/web/tests/cardapio-na-tv.test.tsx, apps/web/tests/vitrine-ui-a11y.test.tsx
- A criar: apps/web/tests/catalogo-textos.onp.test.tsx, apps/web/tests/catalogo-regressao.onp.test.tsx
- Depende de: T-10806
- Modelo: claude-opus-5-5
- Esforço: medio
- Prova que o título principal usa o rótulo do ramo e que "Detalhes do
  Produto" não aparece. O topo curto (voltar, nome, "Aberta") é uma variante compacta e OPCIONAL de `CapaDaVitrine` (prop nova, padrão igual ao de hoje), porque a prévia da aparência e a apresentação da loja também a usam.
- Textos genéricos: busca "Buscar produto" e nenhum termo de veículo, placa,
  chassi, código de fábrica, garantia ou prazo que o cadastro não informe.
- Regressão: `?banners=demo` só fora de produção, dados estruturados só sem
  filtro, loja suspensa "não encontrada", cor da loja e o modo TV. O teste de
  regressão confere que os testes legados da vitrine e do cardápio na TV
  existem e não têm `skip` nem `todo`.
- Não altera `features/tv/*`. Os testes `capa-do-catalogo` e `config-aparencia` continuam passando sem mudança.

## T-10808 — Contrato de filtros e ordens novos (condicionada às perguntas) [pendente]

- Refs: US-10803, AC-10813, AC-10816
- Arquivos: packages/contracts/src/vitrine.ts, apps/api/src/modules/storefront/catalogo-paginado.usecase.ts, apps/api/src/modules/storefront/vitrine.routes.ts, apps/web/src/lib/catalogo-do-navegador.ts, apps/web/src/features/tv/useCatalogoDaTv.ts
- Depende de: T-10803
- Modelo: claude-opus-5-5
- Esforço: alto
- SÓ EXISTE se o dono responder, em Q-10802, Q-10806 ou Q-10807, que quer
  "em estoque", faixa de preço, ordenação nova ou estoque visível. Sem essa
  resposta, esta tarefa fica pendente e nada nela é implementado.
- Campo novo opcional em `esquemaDeProdutoNaVitrine` e na consulta (o objeto é
  estrito e é lido pela TV e pelo feed). Ordem de entrega: contrato, depois
  API, depois web. Teste de regressão da TV e do feed no mesmo passo.
- Mudança de API: exige plano aprovado próprio e o gate de segurança de
  leitura pública (vitrine não expõe dado sensível).
