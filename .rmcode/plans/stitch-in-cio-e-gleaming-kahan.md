# Plano — #106 Stitch · Início e descoberta (/explorar)

## Contexto
Retomada da implementação de T-10601…T-10611 (`.spec/features/stitch-inicio-descoberta/tasks.md`). #104/#105 prontos (Chip/Abas/Gaveta/BotaoMarcavel disponíveis em `@simpleclick/ui`; topo/barra do cliente já montados no layout). Sem commit/push; só meus arquivos reservados.

## Estado encontrado (fato, via git status)
- T-10601 em grande parte feita: `_dados.ts`, `acoes.ts`, `produtos/page.tsx`, `server/feed.ts` alterados; `tests/feed-sessao.onp.test.ts` existe (8 testes).
- T-10602 iniciada: `limpar-dados-locais.ts` criado, `consulta.ts`/`BarraDoFeed.tsx` alterados; falta `feed-localizacao.onp.test.ts`.
- Em andamento parcial (sem teste onp): TelaDoFeed, Post, PostDeLoja, GavetaDeComentarios, BotaoFavoritar, FeedDePosts, useMaisItens.
- Ainda não existem: demais `tests/feed-*.onp.test.tsx`, `loading.tsx`, mudança em `stories.css`/`feed.css`.

## Ordem de execução (uma após a outra)
1. Gate de base (typecheck/lint/test) para ver o que já passa; fechar T-10601 e T-10602 (teste de localização: arredondar a 3 casas, faixa, sem log).
2. T-10603: Suspense por seção, estados vazios/erro (`loading.tsx`, `lojas/page.tsx`, `Stories.tsx`); teste `feed-estados`.
3. T-10604: "Suas lojas" (`FeedDeLojas`, `Cartoes`), visitante sem chamada `/v1/conta/*`; teste `feed-suas-lojas`.
4. T-10605: busca no endereço, Chip do #104 para segmentos, contagem de filtros; teste `feed-busca-segmentos`.
5. T-10606: preço "de" só com `precoOriginalCentavos`, abas Recentes/Atacado, paginação sem repetição; teste `feed-destaques-e-paginas`.
6. T-10607: composição responsiva (`feed.css`, `stories.css`, só tokens `--cor-*`), "Ver todas", sem banner; teste `feed-composicao`.
7. T-10608: Gaveta do #104 nos comentários, ✦ curtir / ★ favoritar, foco visível; teste `feed-acoes`.
8. T-10609: varredura de ausência de mockup/"A decidir"; teste `feed-sem-mockup`.
9. T-10610: título/descrição/canonical em explorar/produtos/lojas (hipótese: seções ficam em /explorar/produtos, Q-10602); teste `feed-links-e-metadados`.
10. T-10611: testes de isolamento entre contas na API (`apps/api/tests/favoritos-e-recentes.test.ts`, `feed-e-tema.test.ts`).

Hipóteses adotadas nas perguntas abertas (registradas no relatório): Q-10601 ordem Stories→Suas lojas→Destaques→Feed; Q-10609 limite 6 por seção; Q-10610 visitante vê convite para entrar; Q-10611 coordenadas permanecem na URL arredondadas; Q-10612 sem mudança de SQL.

## Reuso
`Chip/FaixaDeChips/Abas/Gaveta/BotaoMarcavel` (@simpleclick/ui), `lib/destino-seguro.ts` (`comDestino`), `tokenDaSessao()`, `buscarLojasDaContaNoFeed`.

## Verificação
`pnpm` typecheck, lint e testes do web (e `api` para T-10611) verdes; testes com título `[CA-n] @spec:AC-…`; `onp-spec verify` se disponível. Relatar com `card_report` e progresso via `card_progress`.
