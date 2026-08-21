-- 0017 — a versão do catálogo cobre tudo o que a vitrine mostra
--
-- O QUE FALTAVA. O gatilho que incrementa `stores.catalog_version` existe desde
-- a 0004, mas só em `products`. A vitrine, porém, não mostra só produto: mostra
-- SEÇÕES, na ordem que o dono definiu, com as fotos de cada item. Ocultar a
-- categoria "Natal", reordenar "Bebidas" para o topo ou trocar a foto de um
-- lanche não tocava em nenhuma linha de `products` — e portanto não mexia na
-- versão.
--
-- A CONSEQUÊNCIA seria um cache que às vezes não invalida, que é pior que cache
-- nenhum: o dono muda a vitrine, olha, não vê a mudança, e conclui que o
-- produto está quebrado. Ele não tem como saber que a mudança dele não conta
-- como mudança — e o critério AC-417 exige que reflita sem publicação manual.
--
-- POR QUE AGORA. Até esta semana nada lia essas três tabelas: a falha existia e
-- era inalcançável. O catálogo público (T-402) começa a lê-las, e é o que
-- transforma a lacuna em defeito.
--
-- A FUNÇÃO NÃO MUDA. `app.bump_catalog_version()` já se vira com qualquer
-- tabela que tenha `store_id`, e é isso que ela lê — de NEW ou de OLD, conforme
-- a operação. Escrever uma função por tabela seria copiar quatro vezes a mesma
-- decisão e deixá-las divergir na primeira correção.

BEGIN;

DROP TRIGGER IF EXISTS categories_bump_catalog ON app.categories;
CREATE TRIGGER categories_bump_catalog
  AFTER INSERT OR UPDATE OR DELETE ON app.categories
  FOR EACH ROW EXECUTE FUNCTION app.bump_catalog_version();

DROP TRIGGER IF EXISTS product_categories_bump_catalog ON app.product_categories;
CREATE TRIGGER product_categories_bump_catalog
  AFTER INSERT OR UPDATE OR DELETE ON app.product_categories
  FOR EACH ROW EXECUTE FUNCTION app.bump_catalog_version();

DROP TRIGGER IF EXISTS product_images_bump_catalog ON app.product_images;
CREATE TRIGGER product_images_bump_catalog
  AFTER INSERT OR UPDATE OR DELETE ON app.product_images
  FOR EACH ROW EXECUTE FUNCTION app.bump_catalog_version();

COMMIT;
