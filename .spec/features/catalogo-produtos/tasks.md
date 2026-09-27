# Tasks: Catálogo e Produtos

> feature: catalogo-produtos

## T-300 — Categorias com ordenação e visibilidade [concluida]

- Refs: US-300, AC-300, AC-301, AC-302, AC-303
- Arquivos: apps/api/src/modules/catalog/categorias.routes.ts, apps/api/src/modules/catalog/categorias.usecase.ts, apps/api/src/modules/catalog/categorias.usecase.test.ts, apps/api/tests/categorias-do-painel.int.test.ts, apps/api/tests/apoio-do-painel.ts, apps/api/src/app.ts, apps/web/src/app/api/catalogo/categorias/route.ts, apps/web/src/app/api/catalogo/categorias/[id]/route.ts, apps/web/src/app/(painel)/painel/categorias/page.tsx, apps/web/src/features/painel-catalogo/ListaCategorias.tsx, apps/web/tests/painel-categorias.test.tsx, packages/database/migrations/0007_catalogo_completo.sql
- Notas: o dono lista (com a contagem de produtos vivos), cria, oculta/mostra, ordena e apaga categorias pela área autenticada, e a vitrine pública reflete na próxima visita (a versão do catálogo sobe). Apagar categoria com produtos exige destino (AC-303): sem ele a API responde 409 com a contagem; "mover" leva os vínculos para a outra categoria sem duplicar nem perder a principal e só então apaga (remoção lógica); "ocultar" mantém categoria e produtos, fora da vitrine. A decisão mora em `categorias.usecase.ts`. A tela cobre carregando, erro com "tentar de novo", vazio e lista (P-011). Prova: integração pela rota do painel e pela vitrine pública contra banco real, mais a conversa da tela com a rota.
- Esforço: alto
- Modelo: gpt-5.6-luna

## T-301 — Criador de especificações dentro da categoria [concluida]

- Refs: US-306, AC-325, AC-326, AC-327, AC-330
- Arquivos: apps/api/src/modules/catalog/especificacoes.usecase.ts, apps/api/src/modules/catalog/especificacoes.usecase.test.ts, apps/api/src/modules/catalog/especificacao-esquema.ts, apps/api/src/modules/catalog/especificacao-esquema.test.ts, apps/api/src/modules/catalog/especificacoes.routes.ts, apps/api/src/modules/catalog/especificacoes.routes.test.ts, apps/api/src/app.ts, apps/api/tests/especificacoes-do-painel.int.test.ts, apps/api/tests/apoio-do-painel.ts, packages/database/prisma/schema.prisma, packages/database/tests/esquema-cobre-o-banco.test.ts, packages/database/migrations/0026_especificacoes_da_categoria.sql, apps/web/src/app/(painel)/painel/categorias/[id]/especificacoes/page.tsx, apps/web/src/features/painel-catalogo/EditorEspecificacoes.tsx, apps/web/src/features/painel-catalogo/CamposDeEspecificacao.tsx, apps/web/src/features/painel-catalogo/FormularioProduto.tsx, apps/web/src/features/painel-catalogo/ListaCategorias.tsx, apps/web/src/server/encaminhar-ao-painel.ts, apps/web/src/app/api/catalogo/categorias/[id]/especificacoes/route.ts, apps/web/src/app/api/catalogo/categorias/[id]/especificacoes/[especificacaoId]/route.ts, apps/web/src/app/api/catalogo/categorias/[id]/especificacoes/[especificacaoId]/opcoes/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/especificacoes/route.ts, apps/web/tests/painel-especificacoes.test.tsx
- Notas: registro tipado com chave estrangeira obrigatória — é o que impede o modelo de virar campo livre ingovernável. O esquema de validação é gerado do registro, sem segunda fonte de verdade. As tabelas `attribute_definitions` e `product_attributes` (0007) ganharam modelo tipado e saíram da lista de adiadas. A rota do painel cria, lista, reordena, renomeia, acrescenta opção e remove (lógica, `deprecated_at`) as especificações da categoria; o produto herda as da categoria principal na ordem do dono, e o preenchimento passa pela regra do domínio (obrigatória, lista fechada) antes de gravar. Renomear ou remover com produto preenchido responde 409 com quantos serão afetados e só aplica confirmado; o nome anterior vai para a trilha de auditoria. A migração 0026 faz o item do pedido congelar as especificações (nome da época) em `attributes_snapshot` quando ele chega vazio. O formulário do produto mostra os campos herdados e não salva com obrigatória em branco, sem perder o resto do preenchimento.
- Esforço: xalto
- Modelo: gpt-5.6-luna

## T-302 — Produto: cadastro, edição, rascunho, duplicata e remoção [concluida]

- Refs: US-301, AC-304, AC-307, AC-308
- Arquivos: apps/api/src/modules/catalog/produtos.usecase.ts, apps/api/src/modules/catalog/produtos.usecase.test.ts, apps/api/src/modules/catalog/produtos.routes.ts, apps/api/tests/produtos-do-painel.int.test.ts, apps/web/src/app/(painel)/painel/produtos/page.tsx, apps/web/src/app/(painel)/painel/produtos/novo/page.tsx, apps/web/src/app/(painel)/painel/produtos/[id]/page.tsx, apps/web/src/app/api/catalogo/produtos/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/duplicar/route.ts, apps/web/src/features/painel-catalogo/FormularioProduto.tsx, apps/web/src/features/painel-catalogo/ListaProdutos.tsx, apps/web/tests/painel-produtos.test.tsx
- Notas: cadastro, edição, publicação, rascunho, duplicata e remoção lógica pela área autenticada. Rascunho não aparece na vitrine, nem na busca, nem pelo endereço direto (a política pública recusa). A duplicata segue a regra do domínio (`ESTADO_DA_DUPLICATA`, `nomeDaDuplicata`) e leva os mesmos dados: descrição, atributos do ramo, fotos (com a mesma principal) e especificações preenchidas; preços nomeados, grupos de escolha e variações são das tarefas T-304..T-306 e não são copiados aqui. Remover tira da vitrine e mantém o item do pedido intacto (P-010). A lista do dono distingue erro de vazio e pede confirmação de remoção na própria linha. Prova: integração pelas rotas do painel e pela vitrine pública contra banco real, a conversa da lista com a rota e o enquadramento da foto no cartão da vitrine.
- Esforço: alto
- Modelo: gpt-5.6-luna

## T-303 — Imagens do produto com principal e conferência de conteúdo [concluida]

- Refs: US-301, AC-305, AC-306
- Arquivos: apps/api/src/modules/catalog/imagens.usecase.ts, apps/api/src/modules/catalog/imagens.usecase.test.ts, apps/api/src/modules/catalog/imagens.routes.ts, apps/api/src/modules/catalog/imagens.routes.test.ts, apps/api/src/modules/catalog/hospedagem-de-imagem.ts, apps/api/src/modules/catalog/hospedagem-de-imagem.test.ts, apps/api/tests/imagens-do-painel.int.test.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/imagens/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/imagens/[imagemId]/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/imagens/arquivo/route.ts, apps/web/src/features/painel-catalogo/EnvioDeImagem.tsx, apps/web/src/lib/imagem.ts, apps/web/tests/painel-imagens.test.tsx
- Notas: até cinco fotos por produto (ASM-303), uma principal; a principal vai para o cartão da vitrine, a página do produto mostra todas, e o dono troca a principal a qualquer momento (apagar a principal promove a seguinte). Dois caminhos de envio: a URL HTTPS de uma foto já hospedada e o ARQUIVO (`POST .../imagens/arquivo`, corpo em bytes, até 10 MB), cujo conteúdo a API confere pelos bytes antes de resolver a loja e antes de gastar a cota de mídia (`conferirConteudoDaImagem`); texto disfarçado de .jpg volta 400 com o motivo, acima de 10 MB volta 413. A hospedagem é uma porta (`hospedagem-de-imagem.ts`): Cloudinary com envio assinado e credencial do ambiente (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`), e sem credencial a rota responde 503 em vez de fingir que guardou. O carregador do site pede ao CDN a foto na largura do aparelho. Re-encode fica a cargo do CDN (`f_auto`).
- Esforço: alto
- Modelo: gpt-5.6-luna

## T-304 — Preço como entidade, com regra de aplicação [concluida]

- Refs: US-302, AC-309, AC-310, AC-311, AC-312
- Arquivos: packages/core/src/dinheiro.ts, packages/core/src/dinheiro.test.ts, packages/core/src/preco-aplicavel.ts, packages/core/src/preco-aplicavel.test.ts, apps/api/src/modules/catalog/precos.routes.ts, apps/api/src/modules/cart/conferir-preco.usecase.ts, apps/api/tests/precos-do-produto.int.test.ts, apps/api/tests/apoio-do-catalogo.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/precos/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/precos/[precoId]/route.ts, apps/web/src/features/painel-catalogo/LinhasDePreco.tsx, apps/web/src/lib/dinheiro.ts, apps/web/tests/precos-na-tela.test.tsx
- Notas: preço é entidade (`product_prices`) administrada pelas rotas do painel em `precos.routes.ts` — não há `precos.usecase.ts`: as regras de negócio moram no core. `preco-vigente.ts` (já existente) decide o preço ANUNCIADO de uma unidade; `preco-aplicavel.ts` (novo) decide o preço COBRADO com a quantidade do carrinho, fazendo o atacado entrar sozinho e devolvendo nome e motivo para a tela (o fechamento mostra "Atacado: preço a partir de 6 unidades"). `dinheiro.ts` (novo) lê o que o dono digita sem ponto flutuante e multiplica/soma só inteiros; a conferência do carrinho passou a usá-lo. Preço enviado pelo cliente continua descartado e registrado (`carrinho.total_divergente`, `pedido.total_divergente`), e preço por item no corpo é recusado na borda. Marcado com @principle:P-005 e @principle:P-006.
- Esforço: medio
- Modelo: gpt-5.6-luna

## T-305 — Grupos de escolha que atendem ingrediente e variação [concluida]

- Refs: US-303, AC-313, AC-314, AC-315, AC-317
- Arquivos: apps/api/src/modules/catalog/opcoes.routes.ts, apps/api/tests/carrinho-rota.int.test.ts, apps/api/tests/produto-vitrine.int.test.ts, apps/web/src/app/(painel)/painel/produtos/[id]/opcoes/page.tsx, apps/web/src/app/api/catalogo/produtos/[produtoId]/opcoes/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/opcoes/[grupoId]/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/opcoes/[grupoId]/itens/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/opcoes/[grupoId]/itens/[itemId]/route.ts, apps/web/src/features/painel-catalogo/EditorGrupoOpcao.tsx, apps/web/src/features/produto/EscolhasDoProduto.tsx, apps/web/src/features/produto/SelecaoDeOpcoes.tsx, apps/web/tests/produto-pagina.test.tsx, packages/core/src/item-total.ts, packages/core/src/item-total.test.ts
- Notas: a tela e o servidor respeitam mínimo/máximo; ao atingir o teto, as opções restantes ficam desabilitadas e a tela anuncia o limite. Opções esgotadas continuam visíveis e desabilitadas sem bloquear os demais adicionais; a seleção recalcula o valor antes de enviar, e o pedido guarda o acréscimo separado. Critérios AC-313, AC-314, AC-315 e AC-317 cobertos por testes de tela, core e API; eixos e matriz de variações seguem na T-306.
- Esforço: alto
- Modelo: gpt-5.6-luna

## T-306 — Variações com código próprio e grade [concluida]

- Refs: US-303, AC-316
- Arquivos: apps/api/src/modules/catalog/variacoes.routes.ts, apps/api/src/modules/catalog/opcoes.routes.ts, apps/api/tests/variacoes-do-produto.int.test.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/variacoes/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/variacoes/[variacaoId]/route.ts, apps/web/src/app/(painel)/painel/produtos/[id]/variacoes/page.tsx, apps/web/src/features/painel-catalogo/GradeDeVariacoes.tsx, apps/web/src/features/produto/MatrizDeVariacao.tsx, apps/web/tests/painel-variacoes.test.tsx, apps/web/tests/produto-pagina.test.tsx
- Notas: o dono marca grupos como eixo e cadastra cada variação com a combinação validada (só opção de eixo ligado ao produto), preço em centavos inteiros, código de estoque (SKU) próprio e opcional, estoque e disponibilidade. O SKU não se repete na LOJA (409 `sku_duplicado`, criando ou trocando), e variações sem SKU convivem. Estoque zero é "controla e acabou": a vitrine mostra a variação indisponível e a tela desabilita a opção do eixo sem escondê-la; o carrinho recusa a variação zerada (409) e aceita as demais; repor pelo painel devolve à venda. A grade do painel lê o preço pelo `centavosDoTexto` (antes "19.99" virava R$ 1.999,00) e explica o SKU repetido. Prova: rotas do painel, página pública e carrinho contra banco real, e as telas da grade e do produto. Geração automática da matriz cartesiana e edição em lote ficam fora deste critério; o estoque movimentado é da T-307.
- Esforço: alto
- Modelo: gpt-5.6-luna

## T-307 — Estoque por variação com movimentos [concluida]

- Refs: US-307, AC-331, AC-332, AC-334, AC-335, AC-336, AC-337
- Arquivos: packages/database/migrations/0023_estoque_por_variacao.sql, packages/database/migrations/0027_baixa_ignora_estoque_nao_controlado.sql, packages/database/prisma/schema.prisma, packages/core/src/estoque.ts, packages/core/src/estoque.test.ts, apps/api/src/modules/catalog/estoque.routes.ts, apps/api/src/modules/catalog/produtos.routes.ts, apps/api/src/modules/catalog/variacoes.routes.ts, apps/api/src/modules/orders/devolver-estoque.ts, apps/api/src/modules/orders/mudar-status.usecase.ts, apps/api/tests/estoque-do-produto.int.test.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/estoque/route.ts, apps/web/src/app/api/catalogo/produtos/[produtoId]/variacoes/[variacaoId]/estoque/route.ts, apps/web/src/app/(painel)/painel/produtos/[id]/estoque/page.tsx, apps/web/src/features/painel-catalogo/AjusteDeEstoque.tsx, apps/web/src/features/painel-catalogo/GradeDeVariacoes.tsx, apps/web/src/features/painel-catalogo/ListaProdutos.tsx, apps/web/tests/painel-variacoes.test.tsx, apps/web/tests/painel-produtos.test.tsx
- Notas: estoque contado por variação, com histórico imutável (saldo anterior, delta, posterior, motivo, origem, pedido e autor). A venda baixa só a variação vendida, com movimento `PEDIDO` ligado ao pedido (AC-331); variação zerada não entra no carrinho e o total não muda (AC-332). Cancelar o pedido devolve exatamente o que a baixa tirou, na mesma transação, com movimento `CANCELAMENTO` e sem devolver duas vezes (`devolver-estoque.ts`, chamado pelo caso de uso da máquina de status; AC-334). O ajuste manual exige motivo e guarda quem, quando e o saldo anterior (AC-335). O aviso de estoque mínimo é inclusivo (`estaAcabando`, no core): acende o sinal na lista de produtos do dono, que ganha o recorte "o que está acabando" com o caminho para repor, e na tela de estoque (AC-336). O ramo decide o controle (`tracks_stock`): a grade da lanchonete não pede quantidade e a variação nasce com estoque nulo, vendida por disponível/esgotado (AC-337). A migração 0027 corrige a baixa, que recusava pedido de variação sem contagem — nenhuma lanchonete com variação conseguia fechar pedido. Prova: carrinho, fechamento, cancelamento e rotas do painel contra banco real, regra pura no core e telas da grade e da lista.
- Esforço: alto
- Modelo: gpt-5.6-luna

## T-308 — Baixa de estoque sem vender a mesma última peça duas vezes [concluida]

- Refs: US-307, AC-333
- Arquivos: packages/database/migrations/0024_reserva_de_estoque_no_checkout.sql, apps/api/src/modules/orders/reservar-estoque.ts, apps/api/src/modules/orders/reservar-estoque.test.ts, apps/api/src/modules/orders/pedidos.routes.ts, apps/api/tests/estoque-concorrente.test.ts
- Notas: baixa na confirmação do pedido (ASM-311): função SQL com `SECURITY DEFINER` confere loja, token, pedido e item, faz atualização condicional sob trava de linha e grava movimento `PEDIDO` na mesma transação; se uma variação falha, o pedido inteiro é desfeito. Retry idempotente não baixa novamente. Prova de concorrência real: duas transações da credencial da aplicação disputam a última peça, uma vence, a outra recebe conflito e o saldo não fica negativo (AC-333). A variação sem controle de estoque passa sem baixa (migração 0027, registrada na T-307).
- Esforço: max
- Modelo: gpt-5.6-luna

## T-309 — Vocabulário e layout por ramo [pendente]

- Refs: US-304, AC-318, AC-319, AC-320, AC-322, AC-324
- Arquivos: packages/core/src/vertical.ts, packages/core/src/vertical.test.ts, packages/core/src/index.ts, packages/contracts/src/vertical.ts, packages/contracts/src/index.ts, packages/contracts/src/vitrine.ts, apps/web/src/lib/vertical.ts, apps/web/src/features/painel-catalogo/BlocosPorRamo.tsx, apps/web/src/app/(loja)/l/[slug]/catalogo/page.tsx, apps/api/src/modules/catalog/atributos.usecase.ts, apps/api/src/modules/catalog/atributos.usecase.test.ts, apps/api/src/modules/catalog/produtos.routes.ts, apps/api/src/modules/storefront/dto-publico.ts, apps/api/src/modules/storefront/resolver-loja.usecase.ts
- Notas: primeira fatia funcional normaliza a composição do preset por tela, expõe os blocos no DTO público e usa a composição para renderizar categorias e destaques da vitrine. O cadastro de produto valida atributos conhecidos por ramo (eletrônicos e autopeças) e preserva campos personalizados. A prova formal ONP e a cobertura completa de vocabulário, impressão e WhatsApp permanecem pendentes. O AC-320 (o administrador troca o tipo de negócio e nada se perde) depende da T-203 (admin-lojas), que é quem troca o tipo; o dono já é recusado com explicação (AC-323, provado na T-203).
- Esforço: medio
- Modelo: gpt-5.6-luna

## T-310 — Produto que muda de categoria preserva o preenchido [concluida]

- Refs: US-306, AC-329
- Arquivos: apps/api/src/modules/catalog/mover-categoria.usecase.ts, apps/api/src/modules/catalog/mover-categoria.usecase.test.ts, apps/api/src/modules/catalog/produtos.routes.ts, apps/api/src/modules/catalog/especificacoes.routes.ts, apps/api/tests/mover-categoria.int.test.ts, apps/web/src/features/painel-catalogo/CamposDeEspecificacao.tsx, apps/web/src/app/api/catalogo/produtos/[produtoId]/especificacoes/[especificacaoId]/route.ts, apps/web/tests/painel-mover-categoria.test.tsx
- Notas: o domínio calcula a mudança sem mutar nem apagar valores antigos, marca-os como não usados na categoria atual, devolve as especificações da categoria nova que ainda precisam de preenchimento e planeja a troca de vínculo (`planejarTrocaDeCategoria`): só a categoria principal troca, as seções secundárias continuam, e salvar sem mudar a categoria não mexe em vínculo nenhum (antes, todo salvamento apagava e recriava os vínculos). O estado das especificações do produto traz `campos`, `paraPreencher` e `naoUsadas` (com nome e categoria de onde vieram). Descartar um valor guardado exige confirmação (409 com o que será apagado) e fica na trilha de auditoria; valor em uso não se descarta por aí. Voltar para a categoria anterior reaproveita os valores guardados. O formulário avisa, ao trocar a categoria, que nada será apagado.
- Esforço: baixo
- Modelo: gpt-5.6-luna

## T-311 — Disponibilidade e janela de venda [pendente]

- Refs: US-305, AC-321, AC-322
- Arquivos: apps/api/src/modules/catalog/disponibilidade.usecase.ts, apps/api/src/modules/catalog/disponibilidade.usecase.test.ts, packages/core/src/janela-disponibilidade.ts, packages/core/src/janela-disponibilidade.test.ts, packages/core/src/index.ts
- Notas: primeira fatia de domínio combina disponibilidade manual com janela semanal avaliada no fuso da loja: esgotado vence a janela, terça fora da janela bloqueia e sábado dentro dela libera. A integração da janela com persistência, painel e DTO completo da vitrine permanece pendente.
- Esforço: baixo
- Modelo: gpt-5.6-luna

## T-312 — Filtro por especificação na vitrine [concluida]

- Refs: US-306, AC-328
- Arquivos: apps/api/src/modules/storefront/filtros.usecase.ts, apps/api/src/modules/storefront/filtros.usecase.test.ts, apps/api/tests/filtro-especificacao.int.test.ts, packages/database/migrations/0026_especificacoes_da_categoria.sql, apps/web/src/features/vitrine/FiltroEspecificacao.tsx, apps/web/tests/vitrine-filtro-especificacao.test.tsx
- Notas: só especificação marcada como filtrável vira filtro, e ganha índice próprio (parcial, na 0026). Vale nos dois sentidos: não é oferecida na tela, e escolhê-la pelo endereço é ignorado (a vitrine sai inteira, e não vazia). Corrigido o defeito da primeira fatia: a consulta devolvia `product_id` e o código lia `produto_id`, então todo filtro escolhido esvaziava a vitrine. Os valores oferecidos vêm só de produto que o cliente vê (a política pública recusa rascunho e categoria oculta), em ordem numérica quando o valor é número. O filtro da tela é formulário GET, sem script, e mostra verdadeiro/falso como Sim/Não.
- Esforço: medio
- Modelo: gpt-5.6-luna

## T-313 — Telas de ponta a ponta do catálogo [pendente]

- Refs: US-301, US-303, US-306, US-307, AC-304, AC-313, AC-325, AC-331
- Arquivos: e2e/specs/painel-catalogo.spec.ts, e2e/specs/specs-categoria.spec.ts, e2e/specs/estoque.spec.ts, e2e/specs/produto-opcoes.spec.ts
- Notas: cobre cadastro completo, grupos obrigatórios, criador de especificações e ajuste de estoque.
- Esforço: alto
- Modelo: gpt-5.6-luna
