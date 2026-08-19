-- 0015 — horário de funcionamento, com exceções datadas
--
-- DUAS TABELAS, E O MOTIVO DA SEGUNDA. A grade semanal é o que a loja faz
-- normalmente; a exceção datada é o feriado, as férias, o dia em que o dono
-- fecha para uma reforma. Guardar as duas coisas na mesma grade obrigaria o
-- dono a DESCONFIGURAR a semana para fechar um dia — e a reconfigurá-la depois,
-- de memória, no dia seguinte (AC-912). Quem esquecesse ficaria fechado sem
-- saber por quê.
--
-- Isso também é o que separa a exceção do FECHAMENTO TEMPORÁRIO (AC-911), que
-- já mora em `stores.open_state` desde a 0003: "estou atolado agora" é estado
-- do momento e vence tudo; "vou fechar no Natal" é planejamento e vence só
-- aquele dia. Misturar os dois faria o dono que pausou por duas horas perder o
-- feriado que tinha cadastrado.
--
-- A HORA É `time`, e não `timestamptz`. Faixa de funcionamento não tem data: a
-- loja abre às 18h todo dia, e "18h" é hora LOCAL dela. Guardar com fuso
-- obrigaria a escolher uma data de referência e faria a faixa escorregar no
-- horário de verão — que muda por decreto e não se calcula com aritmética.

SET ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- A grade semanal
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.store_hours (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  -- 0 no domingo, como o JavaScript numera. Uma numeração só, do banco à tela.
  weekday    smallint NOT NULL,
  opens_at   time NOT NULL,
  closes_at  time NOT NULL,
  -- Dia marcado como fechado guarda a faixa que ele TERIA, para o dono voltar a
  -- abrir sem redigitar o horário que já tinha pensado.
  is_closed  boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_hours_dia_valido CHECK (weekday BETWEEN 0 AND 6)
);

CREATE INDEX IF NOT EXISTS store_hours_da_loja_idx
  ON app.store_hours (store_id, weekday, sort_order)
  INCLUDE (opens_at, closes_at, is_closed);

-- ---------------------------------------------------------------------------
-- As exceções datadas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS app.store_hour_exceptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   uuid NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  on_date    date NOT NULL,
  -- O caso comum é fechar; por isso o padrão. Mas a exceção também serve para
  -- ABRIR fora da grade — véspera de Natal com horário estendido, por exemplo.
  is_closed  boolean NOT NULL DEFAULT true,
  opens_at   time,
  closes_at  time,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Exceção que abre precisa dizer de quando a quando: sem as duas horas, ela
  -- diria "abre" sem dizer quando, e a vitrine não teria o que mostrar.
  CONSTRAINT store_hour_exceptions_abertura_completa
    CHECK (is_closed OR (opens_at IS NOT NULL AND closes_at IS NOT NULL))
);

-- Uma exceção por dia: duas para a mesma data seriam duas respostas para a
-- mesma pergunta, e a vitrine escolheria uma sem critério.
CREATE UNIQUE INDEX IF NOT EXISTS store_hour_exceptions_do_dia_uk
  ON app.store_hour_exceptions (store_id, on_date);

-- ---------------------------------------------------------------------------
-- Isolamento
--
-- A vitrine LÊ o horário — é ela que mostra "abre hoje às 18h" a quem chega.
-- Por isso existe política pública de leitura, ao contrário da configuração da
-- loja: aqui não há nada sensível, e esconder o horário deixaria a página
-- pública sem a informação que a pessoa foi buscar. Escrever continua sendo só
-- da equipe.
-- ---------------------------------------------------------------------------

ALTER TABLE app.store_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.store_hours FORCE  ROW LEVEL SECURITY;
ALTER TABLE app.store_hour_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.store_hour_exceptions FORCE  ROW LEVEL SECURITY;

CREATE POLICY store_hours_public_select ON app.store_hours FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()));

CREATE POLICY store_hours_staff_insert ON app.store_hours FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND (SELECT app.is_store_staff()));

CREATE POLICY store_hours_staff_update ON app.store_hours FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id())
          AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND (SELECT app.is_store_staff()));

CREATE POLICY store_hours_staff_delete ON app.store_hours FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.is_store_staff()));

CREATE POLICY store_hours_require_ctx ON app.store_hours
  AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY store_hours_admin_all ON app.store_hours FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

CREATE POLICY store_hour_exceptions_public_select ON app.store_hour_exceptions
  FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()));

CREATE POLICY store_hour_exceptions_staff_insert ON app.store_hour_exceptions
  FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND (SELECT app.is_store_staff()));

CREATE POLICY store_hour_exceptions_staff_update ON app.store_hour_exceptions
  FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id())
          AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id())
          AND (SELECT app.is_store_staff()));

CREATE POLICY store_hour_exceptions_staff_delete ON app.store_hour_exceptions
  FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id())
     AND (SELECT app.is_store_staff()));

CREATE POLICY store_hour_exceptions_require_ctx ON app.store_hour_exceptions
  AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

CREATE POLICY store_hour_exceptions_admin_all ON app.store_hour_exceptions
  FOR ALL TO sc_admin USING (true) WITH CHECK (true);

GRANT SELECT ON app.store_hours, app.store_hour_exceptions TO sc_app;
GRANT INSERT, UPDATE, DELETE ON app.store_hours, app.store_hour_exceptions TO sc_app;
GRANT ALL ON app.store_hours, app.store_hour_exceptions TO sc_admin;

CREATE TRIGGER store_hours_touch BEFORE UPDATE ON app.store_hours
  FOR EACH ROW EXECUTE FUNCTION app.tocar_atualizado_em();
CREATE TRIGGER store_hour_exceptions_touch BEFORE UPDATE ON app.store_hour_exceptions
  FOR EACH ROW EXECUTE FUNCTION app.tocar_atualizado_em();

RESET ROLE;
