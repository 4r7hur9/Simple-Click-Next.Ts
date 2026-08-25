# Tasks: Vitrine Pública

> feature: vitrine-publica

## T-400 — Resolução da loja pelo endereço e página de apresentação [concluida]

- Refs: US-400, AC-400, AC-401, AC-402
- Arquivos: apps/api/src/modules/storefront/resolver-loja.usecase.ts, apps/api/src/modules/storefront/vitrine.routes.ts, apps/api/tests/vitrine-sem-dado-sensivel.test.ts, apps/api/tests/vitrine-rota.int.test.ts, apps/api/src/app.ts, packages/contracts/src/vitrine.ts, packages/contracts/src/rotas.ts, packages/contracts/src/index.ts, contrato/openapi.json, apps/web/src/server/vitrine.ts, apps/web/src/features/loja/ApresentacaoDaLoja.tsx, apps/web/tests/apresentacao-da-loja.test.tsx, apps/web/src/app/(loja)/l/[slug]/page.tsx, apps/web/src/app/(loja)/l/[slug]/not-found.tsx, apps/web/src/app/(loja)/l/[slug]/layout.tsx, packages/ui/styles/narrativa.css, apps/web/src/features/loja/EntradaDaLoja.tsx, apps/web/tests/entrada-da-loja.test.tsx, apps/web/tests/preparo-navegador.ts, vitest.config.ts, pnpm-workspace.yaml, apps/web/package.json, packages/contracts/src/contrato.test.ts, apps/api/src/contracts/gerar.test.ts
- Notas: os três critérios estão provados, e a ROTA existe: `GET /v1/vitrine/:apelido` publicada no contrato e exercitada por requisição de verdade. O AC-401 fechou com a tabela `store_hours`, que veio na T-903. As PÁGINAS entraram: a apresentação da loja é desenhada no SERVIDOR e legível sem script nenhum, que é o que o AC-415 exige e o que a torna encontrável. A página cabe em UMA tela: quem abre o endereço de uma loja quer o cardápio, e três telas de rolagem até o botão é atrito no pior lugar. A cor que o dono escolheu pinta o fundo, a marca e o botão, com o contraste ajustado pelo design system — sem isso, toda loja teria a mesma tela, correta e genérica. A entrada por animação vem por cima, num componente que só existe no navegador e some sem deixar buraco quando não roda. As PÁGINAS do site saíram desta lista e entram junto com a rota HTTP que expõe a resolução — a resolução em si, que é o que os três critérios pedem, está pronta e provada contra o banco. A resolução usa função dedicada que devolve apenas os campos permitidos, porque o contexto da loja ainda não existe nesse momento. São DOIS passos: identificar sem contexto, e ler com contexto numa transação nova — o contexto é definido uma vez, no início da transação, e uma função única precisaria trocá-lo no meio, furando a garantia que sustenta o isolamento. Loja inexistente e suspensa respondem igual, sem revelar se o endereço já existiu.
- Esforço: alto

## T-401 — Saída pública com lista de campos permitidos [concluida]

- Refs: US-400, AC-904
- Arquivos: apps/api/src/modules/storefront/dto-publico.ts, apps/api/src/modules/storefront/dto-publico.test.ts, apps/api/tests/vitrine-sem-dado-sensivel.test.ts, packages/database/migrations/0014_vitrine_le_a_apresentacao.sql
- Notas: fecha o risco que o crítico apontou e que foi observado no concorrente — chave PIX, telefone e configuração interna nunca saem na resposta pública. Lista do que é permitido, nunca do que é proibido.
- Esforço: alto

## T-402 — Catálogo público em cache por loja [concluida]

- Refs: US-401, AC-404, AC-406, AC-407, AC-417
- Arquivos: apps/api/src/modules/storefront/catalogo.usecase.ts, apps/api/src/modules/storefront/vitrine.routes.ts, apps/api/src/modules/storefront/resolver-loja.usecase.ts, apps/api/tests/catalogo-vitrine.int.test.ts, packages/contracts/src/vitrine.ts, packages/contracts/src/index.ts, packages/contracts/src/rotas.ts, packages/database/migrations/0016_vitrine_nao_ve_categoria_oculta.sql, packages/database/migrations/0017_versao_do_catalogo_cobre_a_vitrine.sql, packages/database/prisma/schema.prisma, packages/database/tests/esquema-cobre-o-banco.test.ts, packages/testing/src/factories.ts, packages/testing/src/index.ts, apps/web/src/server/vitrine.ts
- Notas: categoria oculta e produto rascunho não aparecem de forma alguma — e quem garante isso é a POLÍTICA do banco, não o `WHERE` da consulta. A de categorias não filtrava nada apesar do nome "storefront" (migração 0016); a de produtos já filtrava desde a 0004. Repetir o filtro na consulta daria a impressão de que a garantia mora lá.
- Notas: a versão do catálogo é o que faz o cache vencer sozinho. O gatilho existia só em `products` desde a 0004, então ocultar uma seção ou reordenar a vitrine não contava como mudança e o cache serviria a vitrine antiga por tempo indeterminado (migração 0017). Até agora nada lia essas tabelas: a falha existia e era inalcançável.
- Notas: os destaques vêm de consulta PRÓPRIA, e não de filtrar as seções — o produto em destaque pode não estar em categoria nenhuma, e estando em duas apareceria duas vezes.
- Notas: a versão viaja como TEXTO e não como `bigint`. Um teste de vazamento que serializa a resposta inteira pegou isso na primeira rodada: `JSON.stringify` recusa `bigint` com erro em tempo de execução, e em produção o erro apontaria para o serializador, longe da causa.
- Notas: três tabelas saíram da lista de adiamento do Prisma (`categories`, `product_categories`, `product_images`). Ler tabela sem modelo obrigaria a escrever SQL cru, que é o caminho por onde o isolamento entre lojas se perde sem ninguém notar.
- Esforço: alto

## T-403 — Vitrine: categorias, filtro e destaques [concluida]

- Refs: US-401, AC-405, AC-406, AC-407
- Arquivos: apps/web/src/features/vitrine/GradeDeProdutos.tsx, apps/web/src/features/vitrine/AbasDeCategoria.tsx, apps/web/src/features/vitrine/Destaques.tsx, apps/web/src/features/vitrine/CartaoEsgotado.tsx, apps/web/src/app/(loja)/l/[slug]/catalogo/page.tsx, apps/web/src/lib/catalogo.ts, apps/web/src/server/catalogo-na-tela.ts, apps/web/tests/vitrine-catalogo.test.tsx, packages/ui/styles/vitrine.css, packages/ui/package.json, apps/web/src/app/(loja)/l/[slug]/page.tsx, apps/web/tests/apresentacao-da-loja.test.tsx, apps/web/tests/entrada-da-loja.test.tsx
- Notas: o FILTRO DE CATEGORIA MORA NO SERVIDOR, e é isso que faz o AC-405 conviver com o AC-415. A escolha chega pelo endereço (`?categoria=`), o servidor devolve a página já filtrada, e cada aba é um link de verdade. Filtrar no navegador exigiria script para mostrar produto, que é exatamente o que a vitrine não pode exigir — e ainda perderia três coisas de graça: o endereço filtrado que se compartilha, o "voltar" do navegador desfazendo o filtro, e o buscador seguindo cada categoria.
- Notas: A PÁGINA ENTROU nesta tarefa, e não estava na lista original. Sem ela a T-402 tinha publicado o catálogo na API e ninguém o consumia, e o botão principal da apresentação apontava para uma página que não existia — quem abrisse uma loja via a apresentação inteira e caía no 404 no único botão da tela. Eram as dívidas 59 e 61, e as duas fecham aqui.
- Notas: a rota é `/l/{apelido}/catalogo`, como o mapa de telas declara, e não `/cardapio`, como o código dizia (dívida 60). O mapa é o documento que manda, e "catálogo" é a palavra que serve à loja de roupas e à de peças — "cardápio" só serve à lanchonete, e a plataforma vende para as três. O RÓTULO na tela continua "Ver o cardápio": a palavra que a pessoa lê é a da loja dela, o caminho no endereço é o genérico.
- Notas: os DESTAQUES SOMEM quando há filtro em vigor. O AC-405 promete que escolher Bebidas mostra apenas os produtos de Bebidas, e um destaque de outra seção continuar no topo desmentiria a promessa na primeira tela.
- Notas: a tira de destaques é `scroll-snap` do CSS, sem carrossel em script — o dedo arrasta, o cartão encaixa, o teclado percorre porque cada cartão é um link, e nada disso some para quem bloqueia script. Não há avanço automático: conteúdo que se move sozinho sem pausa é violação de acessibilidade conhecida, e o portão verifica isso por máquina.
- Notas: `src/lib/catalogo.ts` existe por causa da TABELA DE FRONTEIRAS. Quem escreve preço é `src/server/catalogo-na-tela.ts`, que alcança `packages/core`; quem desenha é `src/features/vitrine/`, que não alcança o servidor. As duas alcançam `web-lib`, então a forma dos dados é declarada lá uma vez só — em vez de duas cópias que divergem em silêncio no dia em que uma ganhar um campo.
- Notas: produto esgotado CONTINUA NA GRADE, marcado. Sumir com o que acabou faz a vitrine encolher e reaparecer ao longo do dia, e quem procurou a coxinha de ontem conclui que a loja parou de vender coxinha. O impedimento de COMPRAR não está aqui: mora na página do produto (AC-413, T-405), onde existe o botão que precisa ser barrado.
- Notas: o esmaecimento do cartão esgotado é da FOTO, e não do texto — esmaecer nome e preço derrubaria o contraste deles abaixo do mínimo, e é justamente a informação que o produto ainda precisa entregar.
- Esforço: medio

## T-404 — Busca na vitrine [pendente]

- Refs: US-402, AC-408, AC-409
- Arquivos: apps/api/src/modules/storefront/busca.usecase.ts, apps/api/src/modules/storefront/busca.usecase.test.ts, apps/web/src/features/vitrine/BuscaProduto.tsx
- Notas: ignora acento e caixa. Categoria sem resultado desaparece da lista. Sem resultado oferece limpar a busca.
- Esforço: medio

## T-405 — Página de detalhe do produto [pendente]

- Refs: US-403, AC-410, AC-411, AC-412, AC-413, AC-414
- Arquivos: apps/web/src/app/(loja)/l/[slug]/produto/[id]/page.tsx, apps/web/src/features/produto/SelecaoDeOpcoes.tsx, apps/web/src/features/produto/MatrizDeVariacao.tsx, apps/web/src/features/produto/BotaoAdicionar.tsx, apps/web/src/features/produto/SeloDePreco.tsx
- Notas: total do item acompanha as escolhas em tempo real e é conferido no servidor ao adicionar. Grupo obrigatório pendente rola até o grupo e o marca. Endereço compartilhável leva ao produto certo.
- Esforço: alto

## T-406 — Encontrabilidade e compartilhamento [pendente]

- Refs: US-400, US-403, AC-403, AC-414
- Arquivos: apps/web/src/app/(loja)/l/[slug]/sitemap.ts, apps/web/src/app/(loja)/l/[slug]/opengraph-image.tsx, apps/web/src/app/(loja)/l/[slug]/produto/[id]/opengraph-image.tsx, apps/web/src/lib/dados-estruturados.tsx, e2e/specs/canonical.spec.ts
- Notas: dados estruturados de negócio e de produto, endereço canônico único por loja, e imagem de compartilhamento com nome e preço. É vantagem direta sobre o concorrente, cujo cardápio não é indexável.
- Esforço: medio

## T-407 — Desempenho no celular [pendente]

- Refs: US-404, AC-415, AC-416
- Arquivos: apps/web/next.config.ts, apps/web/src/lib/imagem.ts, e2e/specs/desempenho-vitrine.spec.ts
- Notas: conteúdo do catálogo chega pronto do servidor e a página não depende de script para mostrar produto. Espaço da imagem reservado para a página não pular.
- Esforço: alto

## T-408 — Acessibilidade e uso por teclado [pendente]

- Refs: US-405, AC-418, AC-419, AC-420
- Arquivos: e2e/specs/a11y-vitrine.spec.ts, e2e/specs/teclado-vitrine.spec.ts, packages/ui/src/foco.ts
- Notas: ordem lógica de foco, foco visível, e o modal do carrinho devolve o foco ao fechar. Nenhuma violação crítica ou séria. Sem rolagem horizontal na menor largura. Marcado com @principle:P-012.
- Esforço: medio

## T-409 — Teste de ponta a ponta da vitrine [pendente]

- Refs: US-401, US-403, AC-404, AC-410
- Arquivos: e2e/specs/vitrine.spec.ts, e2e/specs/produto-detalhe.spec.ts
- Notas: cobre navegação por categoria, busca, abertura de produto e bloqueio de escolha obrigatória.
- Esforço: medio
