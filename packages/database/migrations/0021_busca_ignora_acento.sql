-- 0021 — a busca ignora acento
--
-- O QUE ESTAVA FALTANDO. O AC-408 exige que a busca ignore diferença de acento
-- e de maiúscula. A coluna `products.search_tsv` já ignora MAIÚSCULA — é o que
-- `to_tsvector` faz —, e NÃO ignora acento: quem digita "pao" não encontra
-- "Pão", e quem digita "acai" não encontra "Açaí". Numa loja brasileira, isso é
-- metade das buscas.
--
-- POR QUE UM ÍNDICE DE EXPRESSÃO, E NÃO TROCAR A COLUNA. Reescrever `search_tsv`
-- exigiria removê-la e recriá-la — coluna GERADA não se altera —, e
-- `DROP COLUMN` quebra a versão anterior enquanto as duas atendem lado a lado
-- (AC-030). O índice de expressão não mexe em coluna nenhuma: é criado, a
-- consulta passa a usá-lo, e a versão antiga segue funcionando sem saber que
-- ele existe.
--
-- `search_tsv` FICA REDUNDANTE a partir daqui. Removê-la é o segundo passo, num
-- dia em que nenhuma versão no ar a leia.
--
-- POR QUE `translate` E NÃO A EXTENSÃO `unaccent`. A extensão faria o trabalho
-- e é a resposta de manual — mas criá-la exige privilégio que a credencial de
-- MIGRAÇÃO não tem: `sc_migrator` recusou, e é ela que roda a publicação. O
-- caminho do superusuário existe (é o que a 0001 faz na criação do banco), e
-- depender dele numa migração que roda em banco JÁ EM PRODUÇÃO é apostar que
-- alguém terá superusuário no dia da troca.
--
-- `translate` não precisa de privilégio nenhum, é imutável por construção, e
-- cobre o português inteiro — que é a língua deste produto. O custo é a lista
-- ser explícita: idioma novo pede uma linha nova, e é um custo que se paga uma
-- vez e se enxerga.

SET ROLE sc_migrator;

CREATE OR REPLACE FUNCTION app.sem_acento(entrada text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT translate(
    entrada,
    'áàâãäÁÀÂÃÄéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
    'aaaaaAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN'
  )
$$;

-- O TEXTO BUSCÁVEL de um produto: nome e descrição, sem acento. A MESMA
-- expressão é escrita na consulta — se as duas divergirem, o índice deixa de
-- ser usado em silêncio e a busca fica lenta sem ninguém notar. Por isso ela
-- mora numa função: um lugar só, e a consulta a chama pelo nome.
--
-- O peso separa nome de descrição: quem procura "coxinha" quer o produto
-- chamado Coxinha antes do que apenas a menciona.
--
-- NÃO É `STRICT`, e a diferença é a busca inteira. `STRICT` faz a função
-- devolver NULO quando QUALQUER argumento é nulo, sem sequer executar o corpo —
-- e descrição vazia é o caso comum, não a exceção: o dono cadastra "Coca-Cola
-- 350ml" e segue para o próximo item. Com `STRICT`, todo produto sem descrição
-- entraria no índice como nulo e NUNCA seria encontrado, nem pelo próprio nome.
-- O `coalesce` de dentro já cobre o nulo — mas só chega a rodar sem `STRICT`.
CREATE OR REPLACE FUNCTION app.texto_de_busca(nome text, descricao text)
RETURNS tsvector
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, app
AS $$
  SELECT setweight(to_tsvector('portuguese'::regconfig,
                               app.sem_acento(coalesce(nome, ''))), 'A')
      || setweight(to_tsvector('portuguese'::regconfig,
                               app.sem_acento(coalesce(descricao, ''))), 'B')
$$;

CREATE INDEX IF NOT EXISTS products_busca_sem_acento_ix
  ON app.products USING gin (app.texto_de_busca(name, description));

REVOKE ALL ON FUNCTION app.sem_acento(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.texto_de_busca(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.sem_acento(text) TO sc_app, sc_admin;
GRANT EXECUTE ON FUNCTION app.texto_de_busca(text, text) TO sc_app, sc_admin;

RESET ROLE;
