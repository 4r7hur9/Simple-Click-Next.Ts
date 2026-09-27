-- 0030 — quantas vezes o cupom do pedido foi impresso (AC-621).
--
-- Reimprimir é rotina: o papel cai no chão, molha, some no espeto. O que não
-- pode acontecer é a segunda via ser confundida com um pedido novo e a cozinha
-- preparar o prato duas vezes. Por isso o cupom sai marcado com o número da via
-- — e o número precisa vir de um lugar só, que as duas saídas (navegador e
-- agente de impressão) somam.
--
-- O contador mora no próprio pedido, e não numa tabela à parte:
--   * a soma é `UPDATE ... SET print_count = print_count + 1 RETURNING`, que o
--     PostgreSQL serializa por linha — duas impressões ao mesmo tempo recebem
--     as vias 2 e 3, nunca duas vias 2;
--   * o pedido já tem isolamento por loja e política de alteração para a
--     equipe da loja (0008), então a coluna nasce isolada sem política nova;
--   * a fila de impressão (T-607) guarda cada trabalho com o seu identificador;
--     este contador é o resumo que o painel e o cupom precisam.
--
-- Compatível com a versão anterior: coluna com padrão constante (sem reescrever
-- a tabela) e coluna que aceita nulo. Código antigo não enxerga nenhuma das duas.
SET ROLE sc_migrator;

ALTER TABLE app.orders
  ADD COLUMN IF NOT EXISTS print_count integer NOT NULL DEFAULT 0
    CONSTRAINT orders_vias_nao_negativas CHECK (print_count >= 0),
  ADD COLUMN IF NOT EXISTS last_printed_at timestamptz;

COMMENT ON COLUMN app.orders.print_count IS
  'Vias do cupom emitidas (navegador ou agente). A via impressa é o valor depois de somar 1 (AC-621).';
COMMENT ON COLUMN app.orders.last_printed_at IS
  'Quando a última via do cupom foi emitida.';

-- O contador só anda para a frente. Diminuir faria a próxima impressão sair
-- como uma via que já existe — exatamente a confusão que ele evita. Gatilho, e
-- não só disciplina de quem escreve o caso de uso, porque vale também para o
-- script administrativo que roda como migrador.
CREATE OR REPLACE FUNCTION app.vias_impressas_so_aumentam() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.print_count < OLD.print_count THEN
    RAISE EXCEPTION 'vias impressas nao diminuem: % para %',
      OLD.print_count, NEW.print_count
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_vias_impressas_so_aumentam ON app.orders;
CREATE TRIGGER orders_vias_impressas_so_aumentam
  BEFORE UPDATE OF print_count ON app.orders
  FOR EACH ROW EXECUTE FUNCTION app.vias_impressas_so_aumentam();

RESET ROLE;
