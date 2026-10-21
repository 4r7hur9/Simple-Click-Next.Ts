-- ===========================================================================
-- 0064 — Faixas de atacado com desconto (card #53).
--
-- O ATACADO JÁ MORAVA EM `product_prices` (0007): uma linha `WHOLESALE` com
-- `min_quantity` e um preço FIXO em `amount_cents`. O dono pediu outra coisa:
-- a faixa diz "a partir de X peças, Y de desconto", e o desconto incide sobre
-- o preço de varejo que vale agora (BASE ou PROMO) do produto ou da variação.
-- Preço fixo envelhece mal: a promoção de terça deixava o atacado mais caro
-- que o varejo.
--
-- O QUE MUDA: duas colunas novas, usadas só pelas faixas WHOLESALE.
--
--   discount_kind   'PERCENT' (inteiro de 1 a 99) ou 'AMOUNT' (centavos)
--   discount_value  o desconto, por unidade
--
-- A linha WHOLESALE COM desconto é uma FAIXA: `amount_cents` fica 0 (o preço
-- sai da conta) e ela pendura no PRODUTO (`variant_id` nulo) — a faixa vale
-- para todas as variações, cada uma com o seu preço de varejo.
-- A linha WHOLESALE SEM desconto é o atacado antigo, de preço fixo, e continua
-- valendo como antes até o dono recadastrá-la (a regra do core entende as duas).
--
-- MODALIDADES: uma faixa só (a partir de 10, 5%) ou CRESCENTE (10 = 5%,
-- 50 = 10%, 100 = 15%). A faixa de menor quantidade é o pedido mínimo de
-- atacado do produto; abaixo dela vale o varejo.
--
-- TRAVAS:
--   - faixa a partir de 2 unidades (1 unidade é varejo);
--   - desconto positivo; percentual entre 1 e 99;
--   - uma faixa por quantidade no produto (índice único parcial);
--   - mesmo tipo de desconto em todas as faixas do produto, e desconto
--     ESTRITAMENTE crescente com a quantidade — quem leva mais nunca paga mais
--     por unidade (gatilho de restrição, adiado para o fim da transação, para o
--     painel poder regravar as faixas em qualquer ordem);
--   - desconto em reais menor que o menor preço BASE do produto (mesmo
--     gatilho). Se o dono baixar o preço depois, a regra do core ignora a faixa
--     que ficou maior que o preço: nunca sai item de graça nem negativo.
--
-- Idempotente: colunas com IF NOT EXISTS, restrições e gatilho recriados.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

ALTER TABLE app.product_prices
  ADD COLUMN IF NOT EXISTS discount_kind  text,
  ADD COLUMN IF NOT EXISTS discount_value bigint;

COMMENT ON COLUMN app.product_prices.discount_kind IS
  'Faixa de atacado: PERCENT (1 a 99) ou AMOUNT (centavos) sobre o preço de varejo vigente. Nulo = preço fixo.';
COMMENT ON COLUMN app.product_prices.discount_value IS
  'Desconto da faixa de atacado, por unidade: percentual inteiro ou centavos.';

ALTER TABLE app.product_prices
  DROP CONSTRAINT IF EXISTS product_prices_atacado_a_partir_de_dois,
  DROP CONSTRAINT IF EXISTS product_prices_desconto_coerente,
  DROP CONSTRAINT IF EXISTS product_prices_faixa_no_produto;

-- Atacado é a partir de 2 unidades, com ou sem desconto (a rota já exigia).
ALTER TABLE app.product_prices
  ADD CONSTRAINT product_prices_atacado_a_partir_de_dois
    CHECK (kind <> 'WHOLESALE' OR min_quantity >= 2);

-- Desconto só em faixa de atacado; tipo e valor andam juntos; valor positivo e
-- percentual de 1 a 99.
ALTER TABLE app.product_prices
  ADD CONSTRAINT product_prices_desconto_coerente
    CHECK (
      (discount_kind IS NULL AND discount_value IS NULL)
      OR (
        kind = 'WHOLESALE'
        AND discount_kind IN ('PERCENT', 'AMOUNT')
        AND discount_value > 0
        AND (discount_kind <> 'PERCENT' OR discount_value BETWEEN 1 AND 99)
      )
    );

-- A faixa com desconto é do produto e não carrega preço próprio.
ALTER TABLE app.product_prices
  ADD CONSTRAINT product_prices_faixa_no_produto
    CHECK (discount_kind IS NULL OR (variant_id IS NULL AND amount_cents = 0));

-- Uma faixa por quantidade no produto.
CREATE UNIQUE INDEX IF NOT EXISTS product_prices_faixa_de_atacado_uk
  ON app.product_prices (store_id, product_id, min_quantity)
  WHERE kind = 'WHOLESALE' AND discount_kind IS NOT NULL;

-- ── Coerência entre as faixas do produto ───────────────────────────────────
-- SECURITY INVOKER (o padrão): roda com os direitos de quem grava, sob a RLS
-- da loja — só enxerga as linhas da própria loja, que é o que precisa.

CREATE OR REPLACE FUNCTION app.product_prices_conferir_faixas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_store   uuid := NEW.store_id;
  v_produto uuid := NEW.product_id;
  v_tipos   integer;
  v_fora    integer;
  v_menor   bigint;
BEGIN
  -- Só as linhas de faixa interessam; a linha pode ter sido apagada depois.
  IF NEW.kind <> 'WHOLESALE' OR NEW.discount_kind IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(DISTINCT discount_kind)
    INTO v_tipos
    FROM app.product_prices
   WHERE store_id = v_store AND product_id = v_produto
     AND kind = 'WHOLESALE' AND discount_kind IS NOT NULL;

  IF v_tipos > 1 THEN
    RAISE EXCEPTION 'faixas de atacado do produto misturam percentual e valor em reais'
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'product_prices_faixas_mesmo_tipo';
  END IF;

  -- Ordenadas pela quantidade, o desconto tem de subir sempre.
  SELECT count(*)
    INTO v_fora
    FROM (
      SELECT discount_value,
             lag(discount_value) OVER (ORDER BY min_quantity) AS anterior
        FROM app.product_prices
       WHERE store_id = v_store AND product_id = v_produto
         AND kind = 'WHOLESALE' AND discount_kind IS NOT NULL
    ) faixas
   WHERE anterior IS NOT NULL AND discount_value <= anterior;

  IF v_fora > 0 THEN
    RAISE EXCEPTION 'o desconto das faixas de atacado precisa crescer com a quantidade'
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'product_prices_faixas_crescentes';
  END IF;

  IF NEW.discount_kind = 'AMOUNT' THEN
    -- O menor preço de varejo do produto (dele ou de qualquer variação);
    -- sem tabela de preços, o preço gravado no próprio produto.
    SELECT coalesce(
             (SELECT min(amount_cents)
                FROM app.product_prices
               WHERE store_id = v_store AND product_id = v_produto
                 AND kind = 'BASE' AND is_active),
             (SELECT display_price_cents
                FROM app.products
               WHERE id = v_produto))
      INTO v_menor;

    IF v_menor IS NOT NULL AND NEW.discount_value >= v_menor THEN
      RAISE EXCEPTION 'o desconto em reais da faixa de atacado precisa ser menor que o preço do produto'
        USING ERRCODE = 'check_violation',
              CONSTRAINT = 'product_prices_desconto_menor_que_o_preco';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS product_prices_faixas_coerentes ON app.product_prices;

CREATE CONSTRAINT TRIGGER product_prices_faixas_coerentes
  AFTER INSERT OR UPDATE ON app.product_prices
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION app.product_prices_conferir_faixas();
