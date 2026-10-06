-- ===========================================================================
-- 0043 — O carrinho que vira pedido sai de cena, na mesma transação do pedido
-- (AC-524, dívida 95).
--
-- O DEFEITO. Nada gravava `carts.converted_at`, e nem podia: a política do
-- visitante (0012) exige `converted_at IS NULL` no `WITH CHECK`, então o papel
-- da aplicação não consegue marcar o próprio carrinho como convertido. Efeito:
-- depois de pedir, o cliente voltava ao fechamento com os mesmos itens, e um
-- segundo "Fechar pedido" — com chave de fechamento nova — criava OUTRO pedido
-- igual, que a cozinha preparava duas vezes.
--
-- O CONSERTO é uma função com os direitos de quem a definiu, no desenho de
-- `enfileirar_impressao` (0034): quem chama é a rota do fechamento, NA MESMA
-- transação em que o pedido nasceu, e o módulo de pedidos não precisa importar
-- o do carrinho. A política do visitante continua como está — ele segue sem
-- poder escrever `converted_at` direto.
--
-- O QUE A FUNÇÃO CONFERE, para não virar um atalho:
--
--   * o carrinho é da loja do contexto e da SESSÃO declarada na transação —
--     ninguém converte o carrinho de outra pessoa;
--   * o pedido é da mesma loja e é o do token declarado na transação, isto é,
--     o que acabou de nascer nela (a mesma prova que autorizou a inserção do
--     pedido, migração 0009);
--   * o carrinho ainda está aberto. Converter duas vezes devolve falso: é o que
--     faz a corrida de dois fechamentos do mesmo carrinho perder um deles — o
--     segundo espera a trava da linha, encontra o carrinho já convertido, e a
--     rota desfaz o pedido duplicado.
--
-- Depois de convertido, o carrinho some para o visitante (política da 0012) e
-- o índice único da sessão (0008) só vale para carrinho aberto: o próximo
-- acesso da mesma sessão abre um carrinho novo, vazio.
--
-- Compatível com a versão anterior: só cria função. Reaplicável: `OR REPLACE`.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

CREATE OR REPLACE FUNCTION app.converter_carrinho(p_carrinho uuid, p_pedido uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_loja   uuid := app.current_store_id();
  v_sessao text := nullif(current_setting('app.cart_session', true), '');
  v_token  text := nullif(current_setting('app.order_token', true), '');
BEGIN
  IF v_loja IS NULL OR v_sessao IS NULL OR v_token IS NULL
     OR p_carrinho IS NULL OR p_pedido IS NULL THEN
    RETURN false;
  END IF;

  UPDATE app.carts c
     SET converted_at = now(),
         updated_at = now()
   WHERE c.id = p_carrinho
     AND c.store_id = v_loja
     AND c.session_token = v_sessao
     AND c.converted_at IS NULL
     AND EXISTS (SELECT 1
                   FROM app.orders o
                  WHERE o.id = p_pedido
                    AND o.store_id = v_loja
                    AND o.public_token = v_token);

  RETURN FOUND;
END $$;

COMMENT ON FUNCTION app.converter_carrinho(uuid, uuid) IS
  'Marca como convertido o carrinho da sessão que virou o pedido do token da transação (0043, AC-524).';

REVOKE ALL ON FUNCTION app.converter_carrinho(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.converter_carrinho(uuid, uuid) TO sc_app;

RESET ROLE;
