-- ===========================================================================
-- 0074 — app.meus_pedidos filtra por LOJA nas duas junções (card #142).
--
-- O gargalo medido com 101 mil pedidos (docs/estruturacao/09-volume.md §7,
-- docs/desempenho.md): a lista da conta do cliente levava 2,4 s para 167
-- linhas. O corpo da 0029 junta store_customers e conta order_items só pelo id,
-- mas os índices que servem a essas leituras começam por store_id
-- (orders_do_cliente_idx e order_items_do_pedido_idx). Sem o store_id na
-- junção, o planejador lê orders inteira (Seq Scan) e faz um Seq Scan em
-- order_items POR pedido devolvido.
--
-- A troca: o MESMO corpo, mais c.store_id = o.store_id na junção do cliente e
-- i.store_id = o.store_id na contagem de itens. Nada mais muda: assinatura,
-- retorno, SECURITY DEFINER, search_path fixo, volatilidade e ACL são os da
-- 0029 (o teste packages/database/tests/meus-pedidos-por-loja.test.ts confere
-- no pg_proc). A 0029 continua intacta; esta migração só substitui a função.
--
-- MUDANÇA DE COMPORTAMENTO, ESTREITANDO: nada no banco garante que o cliente
-- de um pedido seja da mesma loja do pedido (a FK é de uma coluna só). Num
-- vínculo corrompido assim, a função nova deixaria de mostrar o pedido — e a
-- exportação LGPD e as métricas da conta, que a usam, também. Por isso a trava
-- abaixo conta esses vínculos e RECUSA aplicar se houver algum: falha fechada,
-- em vez de esconder em silêncio. A mesma contagem está em
-- docs/estruturacao/06-operacao.md, para rodar antes do deploy.
--
-- Compatível nos dois sentidos com a API: mesma assinatura e mesmas colunas.
-- Volta: uma migração nova com o corpo da 0029 (CREATE OR REPLACE).
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

DO $trava$
DECLARE
  v_clientes bigint;
  v_itens    bigint;
BEGIN
  SELECT count(*) INTO v_clientes
    FROM app.orders o JOIN app.store_customers c ON c.id = o.store_customer_id
   WHERE c.store_id <> o.store_id;
  SELECT count(*) INTO v_itens
    FROM app.order_items i JOIN app.orders o ON o.id = i.order_id
   WHERE i.store_id <> o.store_id;
  IF v_clientes > 0 OR v_itens > 0 THEN
    RAISE EXCEPTION '0074 recusada: % pedido(s) com cliente de outra loja e % item(ns) de outra loja (vínculo entre lojas). Corrija o dado antes.', v_clientes, v_itens;
  END IF;
END
$trava$;

CREATE OR REPLACE FUNCTION app.meus_pedidos(p_order_id uuid DEFAULT NULL)
RETURNS TABLE (
  order_id     uuid,
  store_id     uuid,
  store_name   text,
  store_slug   text,
  number       bigint,
  code         text,
  status       text,
  fulfillment  text,
  total_cents  bigint,
  placed_at    timestamptz,
  updated_at   timestamptz,
  public_token text,
  items_count  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT o.id,
         o.store_id,
         s.name,
         s.slug,
         o.number,
         o.code,
         o.status,
         o.fulfillment,
         o.total_cents,
         o.placed_at,
         o.updated_at,
         o.public_token,
         (SELECT count(*) FROM app.order_items i
           WHERE i.store_id = o.store_id AND i.order_id = o.id)
    FROM app.orders o
    JOIN app.store_customers c ON c.id = o.store_customer_id AND c.store_id = o.store_id
    JOIN app.stores s ON s.id = o.store_id
   WHERE app.current_role_name() = 'CUSTOMER'
     AND app.current_user_id() IS NOT NULL
     AND c.identity_id = app.current_user_id()
     AND (p_order_id IS NULL OR o.id = p_order_id)
   ORDER BY o.placed_at DESC, o.id DESC
$$;

REVOKE ALL ON FUNCTION app.meus_pedidos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.meus_pedidos(uuid) TO sc_app, sc_admin;

RESET ROLE;
