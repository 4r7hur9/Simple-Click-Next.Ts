-- 0010 — a segunda tentativa enxerga o pedido que a primeira criou
--
-- POR QUE ESTA MIGRAÇÃO EXISTE, e por que ela não foi escrita dentro da 0009.
-- A 0009 já estava aplicada quando esta necessidade apareceu, e migração
-- aplicada é imutável — editá-la deixaria o arquivo e o banco divergentes em
-- silêncio, que é exatamente o defeito que a verificação AC-045 passou a barrar
-- nesta mesma semana. Custa uma migração a mais e evita a classe inteira.
--
-- O PROBLEMA. A 0009 deu ao cliente o direito de CRIAR o pedido, autorizado
-- pelo token de acompanhamento que ele declara. Mas a proteção contra pedido
-- duplicado precisa de outra coisa: quando a mesma tentativa chega duas vezes,
-- o servidor tem de ACHAR o pedido que a primeira criou e devolvê-lo. E não
-- consegue — a única leitura que o cliente tem é por token, e a segunda
-- tentativa traz um token novo. O resultado seria a cozinha recebendo dois
-- pedidos iguais e preparando os dois.
--
-- A SOLUÇÃO é a mesma ideia do token, aplicada a outro dado: a chave de
-- fechamento é algo que o cliente gerou e que só ele conhece; apresentá-la é,
-- na prática, provar que foi ele quem fez a primeira tentativa. O banco passa a
-- aceitá-la como credencial de leitura daquele pedido e de nenhum outro.
--
-- A borda da API exige que a chave seja um identificador de alta entropia. Sem
-- essa exigência, alguém poderia tentar chaves curtas ("1", "abc") na esperança
-- de cair no pedido de outra pessoa que tivesse usado uma chave igualmente
-- pobre.

SET ROLE sc_migrator;

DROP POLICY IF EXISTS orders_checkout_lookup ON app.orders;
CREATE POLICY orders_checkout_lookup ON app.orders FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND idempotency_key IS NOT NULL
     AND idempotency_key = nullif(current_setting('app.checkout_key', true), ''));

RESET ROLE;
