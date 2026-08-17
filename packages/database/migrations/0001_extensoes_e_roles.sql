-- ===========================================================================
-- 0001 — Extensões, papéis de banco, esquema `app` e funções de contexto.
--
-- É a base de todas as políticas de isolamento. Nada aqui é conveniência:
-- cada linha existe por um modo de falha registrado em
-- .spec/design/modelo-de-dados.md.
--
-- Quem aplica esta migração precisa ser superusuário na primeira vez, porque
-- só superusuário cria papel com BYPASSRLS e gatilho de evento. Depois disso,
-- `sc_migrator` é dono do esquema e aplica as migrações seguintes sozinho.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Extensões
-- ---------------------------------------------------------------------------
-- pgcrypto: `digest`/`hmac` para o HMAC de telefone e de IP, que existem para
-- que dado pessoal seja reconciliável sem virar índice pesquisável (P-009).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_trgm: busca do administrador por nome de loja em `stores.name`. Sem ela o
-- índice de trigrama de 0003 não pode ser criado.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Três papéis, três credenciais, três agrupadores de conexão
-- ---------------------------------------------------------------------------
-- A separação não é organizacional, é de contenção: uma falha de injeção numa
-- rota de lojista roda na conexão de `sc_app`, e `sc_app` não tem como enxergar
-- outra loja — nem marcando a sessão, porque visão global mora em OUTRA
-- credencial, autenticada com outra senha.
--
-- `sc_migrator` tem BYPASSRLS de propósito e é o ÚNICO que tem: medido, o
-- BYPASSRLS vence o FORCE ROW LEVEL SECURITY. Por isso ele nunca é usado no
-- caminho de requisição.
--
-- NOINHERIT nos papéis de execução: mesmo que um dia alguém os torne membros de
-- outro papel, os privilégios não entram sozinhos na sessão.
--
-- As senhas chegam por variável de ambiente e são substituídas pelo aplicador
-- de migrações antes de o SQL ser enviado (P-002). Nenhum valor real mora aqui.
DO $$
BEGIN
  BEGIN
    EXECUTE format(
      'CREATE ROLE sc_migrator LOGIN BYPASSRLS CREATEROLE PASSWORD %L',
      @@SENHA_BANCO_MIGRADOR@@);
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- papel é do agrupamento, não do banco: pode já existir de outra base
  END;
  EXECUTE format(
    'ALTER ROLE sc_migrator LOGIN BYPASSRLS CREATEROLE PASSWORD %L',
    @@SENHA_BANCO_MIGRADOR@@);

  BEGIN
    EXECUTE format(
      'CREATE ROLE sc_app LOGIN NOBYPASSRLS NOINHERIT PASSWORD %L',
      @@SENHA_BANCO_APLICACAO@@);
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  EXECUTE format(
    'ALTER ROLE sc_app LOGIN NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER PASSWORD %L',
    @@SENHA_BANCO_APLICACAO@@);

  BEGIN
    EXECUTE format(
      'CREATE ROLE sc_admin LOGIN NOBYPASSRLS NOINHERIT PASSWORD %L',
      @@SENHA_BANCO_ADMINISTRACAO@@);
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  EXECUTE format(
    'ALTER ROLE sc_admin LOGIN NOBYPASSRLS NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER PASSWORD %L',
    @@SENHA_BANCO_ADMINISTRACAO@@);
END $$;

-- ---------------------------------------------------------------------------
-- Esquema `app` — dono é o migrador
-- ---------------------------------------------------------------------------
-- Dono separado do tempo de execução importa: dono de tabela ignora a política
-- de isolamento quando ela não está FORÇADA, e é por isso que nenhum papel de
-- requisição pode ser dono de nada aqui.
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION sc_migrator;
ALTER SCHEMA app OWNER TO sc_migrator;

GRANT USAGE ON SCHEMA app TO sc_app, sc_admin;

-- Exatamente os quatro comandos de manipulação de dados. Nunca ALL PRIVILEGES:
-- TRUNCATE e REFERENCES não passam pelo isolamento por linha, então quem os tem
-- contorna a proteção sem precisar de nenhum truque.
ALTER DEFAULT PRIVILEGES FOR ROLE sc_migrator IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sc_app, sc_admin;

-- A partir daqui tudo nasce pertencendo ao migrador, inclusive as funções —
-- função com direitos de quem a definiu roda como o dono dela, então o dono
-- errado transformaria uma função auxiliar numa porta de saída do isolamento.
SET LOCAL ROLE sc_migrator;

-- ---------------------------------------------------------------------------
-- Funções de contexto
-- ---------------------------------------------------------------------------
-- Toleram valor vazio de propósito. Depois de um COMMIT o parâmetro da sessão
-- continua DEFINIDO com cadeia vazia — não volta a ser nulo —, e converter
-- cadeia vazia para identificador levanta 22P02. Sem o `nullif`, a política
-- passaria a quebrar de forma intermitente justamente nas conexões
-- reaproveitadas do agrupador, que é onde ninguém procura o defeito.
--
-- ESTÁVEL e SEGURA PARA PARALELISMO porque o planejador precisa poder avaliar
-- a função uma vez por consulta, e não uma vez por linha.
CREATE OR REPLACE FUNCTION app.current_store_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT nullif(current_setting('app.store_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

-- Ausência de papel é PUBLIC, o menor privilégio possível — nunca o maior.
CREATE OR REPLACE FUNCTION app.current_role_name() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT coalesce(nullif(current_setting('app.role', true), ''), 'PUBLIC') $$;

CREATE OR REPLACE FUNCTION app.is_store_staff() RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT app.current_role_name() IN ('OWNER', 'STAFF') $$;

-- Parâmetro dedicado da página pública de acompanhamento: o portador do link
-- lê UM pedido sem login, e é o banco que decide isso — não a aplicação.
CREATE OR REPLACE FUNCTION app.current_order_token() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT nullif(current_setting('app.order_token', true), '') $$;

-- ---------------------------------------------------------------------------
-- Gatilhos genéricos
-- ---------------------------------------------------------------------------
-- Recusa alteração e remoção de linha. Vale inclusive para o migrador com
-- BYPASSRLS, que é o que a ausência de política sozinha não alcança.
CREATE OR REPLACE FUNCTION app.deny_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'linha imutavel: % nao aceita %', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '23514';
END $$;

CREATE OR REPLACE FUNCTION app.tocar_atualizado_em() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- Gatilho de evento: esquecer o isolamento vira falha fechada
-- ---------------------------------------------------------------------------
-- Tabela nova no esquema `app` já nasce com o isolamento ligado e forçado. O
-- esquecimento passa a produzir tabela que não devolve nada, e não tabela que
-- devolve tudo — a diferença entre um teste vermelho no mesmo dia e um
-- vazamento em produção.
--
-- Isso é defesa em profundidade, e não a prova: a verificação estrutural
-- (AC-008) continua sendo o portão, porque gatilho de evento exige superusuário
-- e nem todo provedor gerenciado o concede.
CREATE OR REPLACE FUNCTION app.force_rls_on_new_tables() RETURNS event_trigger
LANGUAGE plpgsql AS $$
DECLARE
  comando record;
BEGIN
  FOR comando IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
    IF comando.command_tag = 'CREATE TABLE' AND comando.schema_name = 'app' THEN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', comando.object_identity);
      EXECUTE format('ALTER TABLE %s FORCE  ROW LEVEL SECURITY', comando.object_identity);
    END IF;
  END LOOP;
END $$;

RESET ROLE;

DO $$
BEGIN
  IF current_setting('is_superuser') <> 'on' THEN
    RAISE WARNING
      'gatilho de evento trg_force_rls nao criado: exige superusuario. A verificacao estrutural continua valendo como portao (AC-008).';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'trg_force_rls') THEN
    RETURN;
  END IF;

  EXECUTE 'CREATE EVENT TRIGGER trg_force_rls ON ddl_command_end
             WHEN TAG IN (''CREATE TABLE'')
             EXECUTE FUNCTION app.force_rls_on_new_tables()';
END $$;
