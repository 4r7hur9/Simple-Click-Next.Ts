# Card #109 — retomada (de 85% ao fim)

## Contexto
O plan mode está ativo e bloqueia edições. Estado já na árvore: T-10901…T-10911 com código e testes `*.onp.test.tsx` (GaleriaDoProduto, blocos-do-ramo, 5 testes + e2e). Faltam: confirmar T-10910 (depende do #110), T-10912 (condicionada à Q-10904), corrigir a falha em `produto-campos-explicados.test.tsx` e rodar o gate.

## Achado sobre a falha
`npx vitest run tests/produto-campos-explicados.test.tsx` DENTRO de apps/web falha com "Unexpected JSX" (não há vitest.config ali). Na raiz (`vitest.config.ts`) passa: 5/5. Hipótese: a falha vista pelo gerente aparece só no gate completo (interação com outro teste/mock do #109 ou com a nova MatrizDeVariacao). Preciso rodar o gate completo para reproduzir.

## Passos
1. `board_peers` + `board_claim` (features/produto/*, produto.css, lib/produto.ts, server/produto.ts, lib/atacado-na-vitrine.ts, TelaDoCatalogo.tsx, tests/*.onp.*).
2. Rodar da raiz: `pnpm typecheck`, `pnpm lint`, `npx vitest run apps/web/tests` e reproduzir a falha; corrigir no teste ou em `MatrizDeVariacao.tsx` (texto da variação única / `rotuloDaVariacao`) sem enfraquecer asserts.
3. T-10904: conferir que `TelaDoCatalogo.tsx` passa `loja.blocos.detalheProduto` à janela (o #108 terminou).
4. T-10910: só se o #110 já definiu a confirmação (`board_notes`/peers); senão deixar pendente e informar.
5. T-10912: perguntar ao gerente via `board_message` se a Q-10904 foi "sim"; padrão: não fazer.
6. Gate final verde, `card_progress`, `card_report`. Sem commit/push.

## Verificação
typecheck, lint, vitest (raiz) e `onp-spec verify` se disponível.
