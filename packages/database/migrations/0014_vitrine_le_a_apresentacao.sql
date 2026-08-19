-- 0014 — a vitrine lê a apresentação da loja, e só ela
--
-- O PROBLEMA. A página pública precisa das boas-vindas que o dono escreveu, da
-- logo e das cores — tudo guardado em `app.store_settings`. Só que essa mesma
-- LINHA guarda, ao lado, a chave PIX, o número de WhatsApp do dono e a chave do
-- agente de impressão. Dar ao público uma política de leitura sobre a tabela
-- tornaria a chave PIX alcançável no nível do banco: bastaria alguém escrever
-- `select: { payment: true }` num caso de uso futuro, e nenhuma política
-- reclamaria.
--
-- A projeção em código já filtra, e continua filtrando. Mas o projeto não se
-- apoia em uma trava só: a segunda tem de estar no banco. Aqui ela é uma função
-- dedicada que devolve DUAS colunas e nenhuma outra — a chave PIX deixa de ser
-- alcançável pelo caminho público, em vez de ser apenas não pedida.
--
-- A função NÃO recebe a loja por parâmetro. Ela lê a do contexto, que a borda
-- declarou ao abrir a transação. Receber por parâmetro deixaria qualquer
-- requisição pedir a apresentação de qualquer loja — o que é inofensivo hoje,
-- porque apresentação é pública, e deixaria de ser no dia em que alguém
-- acrescentasse um campo à função sem pensar nisso.

SET ROLE sc_migrator;

CREATE OR REPLACE FUNCTION app.storefront_settings()
RETURNS TABLE (landing jsonb, theme jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS
$$ SELECT s.landing, s.theme
     FROM app.store_settings s
     JOIN app.stores l ON l.id = s.store_id
    WHERE s.store_id = app.current_store_id()
      AND l.status = 'ACTIVE'
      AND l.deleted_at IS NULL $$;

REVOKE ALL ON FUNCTION app.storefront_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.storefront_settings() TO sc_app, sc_admin;

RESET ROLE;
