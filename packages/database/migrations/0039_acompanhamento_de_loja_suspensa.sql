-- ===========================================================================
-- 0039 · O pedido de loja suspensa continua acompanhável (admin-lojas, T-206)
--
-- A DECISÃO (Q-203, 03/10/2026): suspender tira a vitrine e o fechamento do
-- ar, mas o cliente que já pediu continua acompanhando o pedido pelo link que
-- recebeu. Loja EXCLUÍDA sai do ar por inteiro.
--
-- O QUE IMPEDIA. A página de acompanhamento lia o nome da loja pela relação
-- com `stores`, e o WhatsApp público por `storefront_settings()`. As duas
-- passam pela regra da vitrine — a política `stores_public_select` e a
-- condição `status = 'ACTIVE'` da função —, que esconde a loja suspensa de
-- propósito (AC-402). Para a loja suspensa, o pedido aparecia sem loja.
--
-- POR QUE UMA FUNÇÃO, E NÃO UMA POLÍTICA NOVA EM `stores`. Uma política de
-- leitura abriria a LINHA INTEIRA da loja suspensa a quem tem o link — com
-- documento, e-mail e telefones do responsável —, e a única coisa entre essa
-- linha e a resposta pública seria o `select` de quem escreveu a consulta. A
-- função devolve uma lista fechada de dois campos (nome e o WhatsApp que o
-- dono configurou; quem decide se ele é público é a leitura de sempre, pela
-- marca `publico`), e só para o portador do link: sem token do pedido no
-- contexto, ou com token de outra loja, ela não devolve nada.
--
-- COMPATÍVEL COM A VERSÃO ANTERIOR (AC-030): só acrescenta uma função. A
-- versão anterior continua lendo pelo caminho antigo, que não mudou.
-- ===========================================================================

SET ROLE sc_migrator;

CREATE OR REPLACE FUNCTION app.tracked_order_store()
RETURNS TABLE (name text, whatsapp jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS
$$ SELECT l.name, s.whatsapp
     FROM app.orders o
     JOIN app.stores l ON l.id = o.store_id
     LEFT JOIN app.store_settings s ON s.store_id = l.id
    WHERE o.store_id = app.current_store_id()
      AND app.current_order_token() IS NOT NULL
      AND o.public_token = app.current_order_token()
      AND l.status IN ('ACTIVE', 'SUSPENDED')
      AND l.deleted_at IS NULL
    LIMIT 1 $$;

REVOKE ALL ON FUNCTION app.tracked_order_store() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.tracked_order_store() TO sc_app, sc_admin;

RESET ROLE;
