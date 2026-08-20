# Tasks: Vitrine Pública

> feature: vitrine-publica

## T-400 — Resolução da loja pelo endereço e página de apresentação [concluida]

- Refs: US-400, AC-400, AC-401, AC-402
- Arquivos: apps/api/src/modules/storefront/resolver-loja.usecase.ts, apps/api/src/modules/storefront/vitrine.routes.ts, apps/api/tests/vitrine-sem-dado-sensivel.test.ts, apps/api/tests/vitrine-rota.int.test.ts, apps/api/src/app.ts, packages/contracts/src/vitrine.ts, packages/contracts/src/rotas.ts, packages/contracts/src/index.ts, contrato/openapi.json
- Notas: os três critérios estão provados, e a ROTA existe: `GET /v1/vitrine/:apelido` publicada no contrato e exercitada por requisição de verdade. O AC-401 fechou com a tabela `store_hours`, que veio na T-903. As PÁGINAS do site entram em seguida — agora elas têm de onde carregar. As PÁGINAS do site saíram desta lista e entram junto com a rota HTTP que expõe a resolução — a resolução em si, que é o que os três critérios pedem, está pronta e provada contra o banco. A resolução usa função dedicada que devolve apenas os campos permitidos, porque o contexto da loja ainda não existe nesse momento. São DOIS passos: identificar sem contexto, e ler com contexto numa transação nova — o contexto é definido uma vez, no início da transação, e uma função única precisaria trocá-lo no meio, furando a garantia que sustenta o isolamento. Loja inexistente e suspensa respondem igual, sem revelar se o endereço já existiu.
- Esforço: alto

## T-401 — Saída pública com lista de campos permitidos [concluida]

- Refs: US-400, AC-904
- Arquivos: apps/api/src/modules/storefront/dto-publico.ts, apps/api/src/modules/storefront/dto-publico.test.ts, apps/api/tests/vitrine-sem-dado-sensivel.test.ts, packages/database/migrations/0014_vitrine_le_a_apresentacao.sql
- Notas: fecha o risco que o crítico apontou e que foi observado no concorrente — chave PIX, telefone e configuração interna nunca saem na resposta pública. Lista do que é permitido, nunca do que é proibido.
- Esforço: alto

## T-402 — Catálogo público em cache por loja [pendente]

- Refs: US-401, AC-404, AC-417
- Arquivos: apps/api/src/modules/storefront/catalogo.usecase.ts, apps/api/src/modules/storefront/catalogo.usecase.test.ts, apps/web/src/server/cache.ts, apps/web/src/app/(loja)/l/[slug]/loading.tsx, apps/web/src/app/(loja)/l/[slug]/error.tsx
- Notas: categoria oculta e produto rascunho não aparecem de forma alguma. Mudança de preço ou publicação reflete dentro do prazo definido, sem publicação manual.
- Esforço: alto

## T-403 — Vitrine: categorias, filtro e destaques [pendente]

- Refs: US-401, AC-405, AC-406, AC-407
- Arquivos: apps/web/src/features/vitrine/GradeDeProdutos.tsx, apps/web/src/features/vitrine/AbasDeCategoria.tsx, apps/web/src/features/vitrine/Destaques.tsx, apps/web/src/features/vitrine/CartaoEsgotado.tsx
- Notas: destaques navegáveis com o dedo no celular. Loja sem produto explica que o catálogo está sendo montado, em vez de tela vazia.
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
