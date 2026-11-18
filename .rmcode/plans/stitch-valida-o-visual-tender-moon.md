# Plano #114 — Validação visual e regressão (T-11401…T-11412)

Contexto: só testes (e2e/specs/*.onp.spec.ts, e2e/fixtures/, apps/web/tests/*.onp.test.*). Sem código de produção, sem .spec/, sem commit.
Perguntas Q-11401…12 seguem abertas: adoto as propostas da spec (larguras 344/390/768/1024/1280, sem baseline de pixels, escuro+claro, capturas fora do git, N=1.000) e registro como hipótese.
Ordem (Q-11410): T-11404 → 11405 → 11406–11409 → 11410 → 11402/11403 → 11411 → 11412 (T-11401 é matriz, já em design.md; só conferir).
Achados de produção viram board_message ao gerente. Falha conhecida fora do card: gerar.test.ts (4 testes).

Verificação: `pnpm --filter @simpleclick/e2e typecheck`, `pnpm --filter @simpleclick/e2e test:e2e` (precisa banco/Redis), vitest `--project web` nos *.onp.test.*.
