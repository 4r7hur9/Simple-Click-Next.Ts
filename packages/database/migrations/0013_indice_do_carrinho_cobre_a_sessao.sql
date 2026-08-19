-- 0013 — o índice do carrinho inclui a coluna que a política do visitante cita
--
-- A guarda G5 acusou, e pela mesma razão da 0011: sob isolamento por linha, o
-- índice cobridor precisa das colunas que as POLÍTICAS citam, porque a
-- reconferência do isolamento roda em toda leitura e o que ela não achar no
-- índice ela busca no disco.
--
-- A política `carts_visitante_select` (migração 0012) cita `session_token`. Ela
-- é permissiva e vale para toda leitura de `app.carts`, então o índice do
-- painel — que lista os carrinhos da loja por data — passou a precisar dessa
-- coluna, mesmo nunca filtrando por ela.

SET ROLE sc_migrator;

DROP INDEX IF EXISTS app.carts_da_loja_idx;
CREATE INDEX carts_da_loja_idx
  ON app.carts (store_id, updated_at DESC)
  INCLUDE (store_customer_id, channel, converted_at, session_token);

RESET ROLE;
