-- 0020 — a linha de pedidos da loja, para montar a conversa
--
-- O QUE ESTA FUNÇÃO RESOLVE. O AC-520 exige que, ao confirmar o pedido, a
-- conversa com o número da LOJA abra com o texto já preenchido. Para montar
-- esse endereço, quem cria o pedido precisa do número.
--
-- POR QUE ELA É SEPARADA DE `checkout_settings()`. O número NÃO É CAMPO da
-- resposta de fechamento: ele entra apenas embutido no endereço da conversa, e
-- esse endereço só volta para quem ACABOU de criar um pedido. A diferença
-- importa mais do que parece.
--
-- NA CARGA DE EXEMPLO, o número da loja e o telefone do dono são O MESMO —
-- e isso é realista, porque no pequeno negócio o dono É o WhatsApp da loja.
-- Publicá-lo na vitrine seria publicar o celular pessoal dele para qualquer
-- pessoa que abrisse o endereço, e para todo robô que varresse a plataforma.
--
-- O desenho aqui é o mesmo da chave PIX (migração 0019), e pelo mesmo motivo:
-- quem já pediu precisa do número para mandar a mensagem; quem está passando
-- não precisa. Uma função separada torna difícil o acidente de serializar o
-- número junto de outra coisa — ela devolve UMA coluna, e quem a chama é uma
-- rota só.
--
-- A loja precisa estar ATIVA, como nas funções vizinhas.

SET ROLE sc_migrator;

CREATE OR REPLACE FUNCTION app.store_whatsapp()
RETURNS TABLE (whatsapp jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS
$$ SELECT s.whatsapp
     FROM app.store_settings s
     JOIN app.stores l ON l.id = s.store_id
    WHERE s.store_id = app.current_store_id()
      AND l.status = 'ACTIVE'
      AND l.deleted_at IS NULL $$;

REVOKE ALL ON FUNCTION app.store_whatsapp() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.store_whatsapp() TO sc_app, sc_admin;

RESET ROLE;
