-- 0016 — a vitrine não vê categoria oculta nem apagada
--
-- O QUE ESTAVA ERRADO. A política pública de `categories` deixava PUBLIC ler
-- TODAS as categorias da loja, inclusive as marcadas como ocultas e as
-- removidas por `deleted_at`. O nome dela dizia "storefront"; o conteúdo dizia
-- apenas "é desta loja e quem pergunta é público".
--
-- POR QUE ISSO IMPORTA MESMO SEM CÓDIGO ERRADO. O critério AC-404 exige que a
-- categoria oculta não apareça "de forma alguma". Enquanto o filtro morar só na
-- consulta, essa garantia vale o cuidado de quem escreveu a consulta — e a
-- primeira consulta nova que esquecer o `WHERE` vaza o nome da seção que o dono
-- escondeu de propósito. Ocultar uma categoria costuma ser preparação: a seção
-- de Natal montada em outubro, o produto que ainda não estreou, a linha que
-- saiu do cardápio. Nenhuma dessas é informação pública.
--
-- É O MESMO PADRÃO QUE `products` JÁ USA desde a 0004, onde a política pública
-- cobra `status = 'PUBLISHED' AND deleted_at IS NULL`. Categorias nasceram sem
-- essa metade e ninguém notou porque nada as lia ainda. O código que as lê
-- começa agora (T-402), e a hora de fechar é antes.
--
-- A POLÍTICA DO STAFF NÃO MUDA. Quem administra a loja precisa enxergar o que
-- escondeu, senão não teria como reexibir.

BEGIN;

DROP POLICY IF EXISTS categories_storefront_select ON app.categories;

CREATE POLICY categories_storefront_select ON app.categories FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.current_role_name()) IN ('PUBLIC', 'CUSTOMER')
     AND is_visible
     AND deleted_at IS NULL);

COMMIT;
