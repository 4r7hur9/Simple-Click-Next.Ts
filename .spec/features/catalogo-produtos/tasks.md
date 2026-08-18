# Tasks: Catálogo e Produtos

> feature: catalogo-produtos

## T-300 — Categorias com ordenação e visibilidade [pendente]

- Refs: US-300, AC-300, AC-301, AC-302, AC-303
- Arquivos: apps/api/src/modules/catalog/categorias.usecase.ts, apps/api/src/modules/catalog/categorias.usecase.test.ts, apps/api/src/modules/catalog/catalog.schema.ts, apps/web/src/app/(painel)/painel/categorias/page.tsx, apps/web/src/features/painel-catalogo/ListaOrdenavel.tsx, packages/contracts/src/catalog.ts, packages/database/migrations/0007_catalogo_completo.sql
- Notas: apagar categoria com produtos exige escolher destino, para não criar produto órfão. Ocultar não apaga produto.
- Esforço: alto

## T-301 — Criador de especificações dentro da categoria [pendente]

- Refs: US-306, AC-325, AC-326, AC-327, AC-330
- Arquivos: apps/api/src/modules/catalog/especificacoes.usecase.ts, apps/api/src/modules/catalog/especificacoes.usecase.test.ts, apps/api/src/modules/catalog/especificacao-esquema.ts, apps/api/src/modules/catalog/especificacao-esquema.test.ts, apps/web/src/app/(painel)/painel/categorias/[id]/especificacoes/page.tsx, apps/web/src/features/painel-catalogo/EditorEspecificacoes.tsx
- Notas: registro tipado com chave estrangeira obrigatória — é o que impede o modelo de virar campo livre ingovernável. O esquema de validação é gerado do registro, sem segunda fonte de verdade. Renomear ou remover guarda histórico, porque pedido antigo exibe o nome da época.
- Esforço: max

## T-302 — Produto: cadastro, edição, rascunho, duplicata e remoção [pendente]

- Refs: US-301, AC-304, AC-307, AC-308
- Arquivos: apps/api/src/modules/catalog/produtos.usecase.ts, apps/api/src/modules/catalog/produtos.usecase.test.ts, apps/web/src/app/(painel)/painel/produtos/page.tsx, apps/web/src/app/(painel)/painel/produtos/[id]/page.tsx, apps/web/src/features/painel-catalogo/FormularioProduto.tsx
- Notas: rascunho não aparece na vitrine nem por endereço direto. Remover não afeta pedido que já incluiu o produto.
- Esforço: alto

## T-303 — Imagens do produto com principal e conferência de conteúdo [pendente]

- Refs: US-301, AC-305, AC-306
- Arquivos: apps/api/src/modules/catalog/imagens.usecase.ts, apps/api/src/modules/catalog/imagens.usecase.test.ts, apps/web/src/features/painel-catalogo/EnvioDeImagem.tsx, apps/web/src/lib/imagem.ts
- Notas: principal garantida por regra do banco, não por convenção. Arquivo conferido pelos bytes. Imagem servida no tamanho adequado ao dispositivo. Depende da decisão pendente D2.
- Esforço: alto

## T-304 — Preço como entidade, com regra de aplicação [pendente]

- Refs: US-302, AC-309, AC-310, AC-311, AC-312
- Arquivos: packages/core/src/dinheiro.ts, packages/core/src/dinheiro.test.ts, packages/core/src/preco-aplicavel.ts, packages/core/src/preco-aplicavel.test.ts, apps/api/src/modules/catalog/precos.usecase.ts, apps/api/src/modules/catalog/precos.usecase.test.ts, apps/web/src/features/painel-catalogo/LinhasDePreco.tsx
- Notas: centavos inteiros do início ao fim; três unidades de R$ 19,99 dão exatamente R$ 59,97. Preço vindo do cliente é descartado e a tentativa registrada. Marcado com @principle:P-005 e @principle:P-006.
- Esforço: alto

## T-305 — Grupos de escolha que atendem ingrediente e variação [pendente]

- Refs: US-303, AC-313, AC-314, AC-315, AC-317
- Arquivos: apps/api/src/modules/catalog/grupos-opcao.usecase.ts, apps/api/src/modules/catalog/grupos-opcao.usecase.test.ts, packages/core/src/validar-escolhas.ts, packages/core/src/validar-escolhas.test.ts, apps/web/src/app/(painel)/painel/produtos/[id]/opcoes/page.tsx, apps/web/src/features/painel-catalogo/EditorGrupoOpcao.tsx
- Notas: obrigatoriedade derivada do mínimo de escolhas, não coluna redundante. Opção esgotada não bloqueia o produto inteiro. Acréscimo soma antes de ir ao carrinho e é registrado separado do preço base.
- Esforço: alto

## T-306 — Variações com código próprio e grade [pendente]

- Refs: US-303, AC-316
- Arquivos: apps/api/src/modules/catalog/variacoes.usecase.ts, apps/api/src/modules/catalog/variacoes.usecase.test.ts, apps/web/src/features/painel-catalogo/GradeDeVariacoes.tsx
- Notas: é onde variação difere de ingrediente — tem código de estoque e quantidade próprios. A combinação dos eixos resolve qual variação é vendida.
- Esforço: alto

## T-307 — Estoque por variação com movimentos [pendente]

- Refs: US-307, AC-331, AC-332, AC-334, AC-335, AC-336, AC-337
- Arquivos: packages/database/migrations/0007_estoque.sql, apps/api/src/modules/catalog/estoque.usecase.ts, apps/api/src/modules/catalog/estoque.usecase.test.ts, apps/web/src/app/(painel)/painel/produtos/[id]/estoque/page.tsx, apps/web/src/features/painel-catalogo/AjusteDeEstoque.tsx
- Notas: todo movimento registra motivo, origem, autor e quantidade anterior. Cancelamento devolve. Ligado por ramo: nasce ativo para roupas, autopeças e eletrônicos, desligado para comida.
- Esforço: alto

## T-308 — Baixa de estoque sem vender a mesma última peça duas vezes [pendente]

- Refs: US-307, AC-333
- Arquivos: apps/api/src/modules/orders/reservar-estoque.ts, apps/api/src/modules/orders/reservar-estoque.test.ts, apps/api/tests/estoque-concorrente.test.ts
- Notas: travamento da linha da variação dentro da mesma transação que cria o pedido. Estoque nunca fica negativo. Depende da decisão pendente D5.
- Esforço: max

## T-309 — Vocabulário e layout por ramo [pendente]

- Refs: US-304, AC-318, AC-319, AC-320, AC-322, AC-324
- Arquivos: packages/core/src/vertical.ts, packages/core/src/vertical.test.ts, packages/contracts/src/vertical.ts, apps/web/src/lib/vertical.ts, apps/web/src/features/painel-catalogo/BlocosPorRamo.tsx, apps/api/src/modules/catalog/atributos.usecase.ts
- Notas: o preset carrega vocabulário e composição de tela — quais blocos aparecem, em que ordem, quais ficam ocultos. Em nenhuma tela de autopeça ou de roupa aparece a palavra cardápio, incluindo cupom impresso e mensagem do WhatsApp. Produto guarda o ramo do próprio cadastro, então trocar o ramo da loja não invalida dado.
- Esforço: max

## T-310 — Produto que muda de categoria preserva o preenchido [pendente]

- Refs: US-306, AC-329
- Arquivos: apps/api/src/modules/catalog/mover-categoria.usecase.ts, apps/api/src/modules/catalog/mover-categoria.usecase.test.ts
- Notas: valores da categoria anterior são preservados e marcados como não usados; nada é apagado sem confirmação.
- Esforço: medio

## T-311 — Disponibilidade e janela de venda [pendente]

- Refs: US-305, AC-321, AC-322
- Arquivos: apps/api/src/modules/catalog/disponibilidade.usecase.ts, apps/api/src/modules/catalog/disponibilidade.usecase.test.ts, packages/core/src/janela-disponibilidade.ts, packages/core/src/janela-disponibilidade.test.ts
- Notas: esgotado aparece com selo e sem botão ativo. Janela por dia e horário avaliada no fuso da loja, sem o dono precisar mexer.
- Esforço: medio

## T-312 — Filtro por especificação na vitrine [pendente]

- Refs: US-306, AC-328
- Arquivos: apps/api/src/modules/storefront/filtros.usecase.ts, apps/api/src/modules/storefront/filtros.usecase.test.ts, apps/web/src/features/vitrine/FiltroEspecificacao.tsx
- Notas: só especificação marcada como filtrável vira filtro, e ganha índice próprio.
- Esforço: medio

## T-313 — Telas de ponta a ponta do catálogo [pendente]

- Refs: US-301, US-303, US-306, US-307, AC-304, AC-313, AC-325, AC-331
- Arquivos: e2e/specs/painel-catalogo.spec.ts, e2e/specs/specs-categoria.spec.ts, e2e/specs/estoque.spec.ts, e2e/specs/produto-opcoes.spec.ts
- Notas: cobre cadastro completo, grupos obrigatórios, criador de especificações e ajuste de estoque.
- Esforço: alto
