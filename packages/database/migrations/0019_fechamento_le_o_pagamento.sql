-- 0019 — o fechamento lê pagamento e entrega, e só ele
--
-- O QUE ESTA FUNÇÃO RESOLVE. O AC-510 exige que o cliente veja a chave PIX da
-- loja ao escolher pagar com PIX. O AC-904 exige que a mesma chave NÃO apareça
-- nos dados públicos da vitrine — ela deve aparecer "somente no fechamento de
-- um pedido daquela loja".
--
-- Os dois convivem porque são MOMENTOS diferentes, e não permissões diferentes:
-- a chave PIX não é segredo de quem vai pagar, é segredo de quem está
-- varrendo a plataforma para montar uma lista de chaves. Quem abre a vitrine
-- não precisa dela; quem chegou ao fechamento, precisa.
--
-- POR QUE UMA FUNÇÃO, E NÃO UM `SELECT` NA TABELA. A linha de `store_settings`
-- guarda a chave PIX ao lado da configuração de impressão, dos avisos e do
-- WhatsApp do dono. Ler a linha inteira tornaria tudo isso alcançável pelo
-- caminho do fechamento, bastando alguém escrever `select: { printing: true }`
-- num caso de uso futuro — que foi exatamente o motivo de a 0014 existir para a
-- vitrine. A função devolve TRÊS colunas, e é o esquema quem garante isso.
--
-- O QUE ELA NÃO DEVOLVE, e por quê:
--   * `whatsapp`  — o número do dono. Ele é usado para MANDAR o pedido, e o
--                   texto é montado depois de o pedido existir (T-508). Antes
--                   disso, é o telefone de uma pessoa numa página pública.
--   * `printing`  — largura de papel e agente de impressão: operação da loja.
--   * `notifications`, `seo` — nada que o cliente decida.
--
-- `SECURITY DEFINER` com `search_path` fixo, como as funções vizinhas: ela
-- roda com o dono do esquema e por isso não depende da política da tabela — o
-- que ela devolve é decidido aqui, no corpo, e não por quem a chama. O
-- `search_path` fixo é o que impede alguém criar um `app` de mentira à frente.
--
-- A loja precisa estar ATIVA. Loja suspensa não fecha pedido, e devolver a
-- configuração dela contaria que o endereço existe — o mesmo cuidado que a
-- 0014 tomou.

SET ROLE sc_migrator;

CREATE OR REPLACE FUNCTION app.checkout_settings()
RETURNS TABLE (checkout jsonb, delivery jsonb, payment jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_temp AS
$$ SELECT s.checkout, s.delivery, s.payment
     FROM app.store_settings s
     JOIN app.stores l ON l.id = s.store_id
    WHERE s.store_id = app.current_store_id()
      AND l.status = 'ACTIVE'
      AND l.deleted_at IS NULL $$;

REVOKE ALL ON FUNCTION app.checkout_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.checkout_settings() TO sc_app, sc_admin;

RESET ROLE;
