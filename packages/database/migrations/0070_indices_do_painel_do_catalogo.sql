-- ===========================================================================
-- 0070 — Índices das listas do catálogo no painel (card #76).
--
-- A lista de produtos e as páginas Estoque, Variações e Opções passaram a
-- paginar no banco (`apps/api/src/modules/catalog/listagem-do-painel.ts`).
-- Numa loja de dez mil autopeças, a ORDEM por preço e por nome, sem índice,
-- ordenava a loja inteira a cada página. Estes dois índices entregam a página
-- já na ordem.
--
-- A BUSCA NÃO GANHA ÍNDICE, de propósito. Com a política de linha ligada (o
-- papel da API), o PostgreSQL não usa índice para `LIKE` nem para expressão
-- regular: os operadores não são "leakproof" e só rodam depois das políticas.
-- Um índice trigram ficaria parado e custaria em cada gravação. O que deixa a
-- busca rápida é a expressão ser barata por linha (ver `expressaoDaBusca`).
-- ===========================================================================

SET ROLE sc_migrator;

CREATE INDEX IF NOT EXISTS products_store_preco_ix
  ON app.products (store_id, display_price_cents)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS products_store_nome_ix
  ON app.products (store_id, lower(name))
  WHERE deleted_at IS NULL;

RESET ROLE;
