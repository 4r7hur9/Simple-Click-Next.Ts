# C4 — Nível 2: Contêineres

Diagrama, tabela de fluxos e usos reais do Redis:

➡ [`docs/arquitetura/c4.md` — seção 2. Contêineres](../arquitetura/c4.md#2-contêineres)

Resumo: **Web** (Next.js, `apps/web`) → **API** (Express, `apps/api`, rotas `/v1`) → **PostgreSQL** (`packages/database`) e **Redis** (limite de tentativas, cache, filas). Decisões: [ADR 0002](../adr/0002-database-pattern-prisma-e-sql.md) (acesso ao banco). Voltar ao [contexto](contexto.md).
