-- ===========================================================================
-- 0033 — Contrato e documentos da loja (feature admin-lojas, T-205).
--
-- O administrador guarda o contrato assinado e os documentos do responsável
-- (foto do documento, comprovante de endereço), como o painel do primeiro
-- SimpleClick pedia. É o dado mais sigiloso da plataforma depois da senha, e
-- o desenho do modelo de dados o trata assim:
--
--   1. Só a credencial da ADMINISTRAÇÃO alcança a tabela. Nenhuma política
--      para `sc_app`, e o privilégio também é retirado: nem o próprio dono da
--      loja vê o contrato pela conexão das lojas (AC-205). Uma injeção numa
--      rota de lojista não chega aqui, porque aquela conexão nem tem a senha
--      da administração.
--   2. O arquivo NÃO mora no banco: mora no armazenamento privado (decisão
--      D2b, pendente) e aqui fica só o que o descreve — tipo conferido pelos
--      bytes, tamanho, resumo SHA-256, nome original como metadado e quem
--      enviou. A chave do armazenamento é gerada pelo servidor e não carrega
--      nada do nome que veio do navegador.
--   3. Toda abertura vira linha na trilha de auditoria, pela aplicação.
--
-- Compatível com a versão anterior: só acrescenta uma tabela.
-- ===========================================================================

SET LOCAL ROLE sc_migrator;

CREATE TABLE IF NOT EXISTS app.store_contracts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          uuid        NOT NULL REFERENCES app.stores (id) ON DELETE CASCADE,
  kind              text        NOT NULL,
  -- `<loja>/<uuid>`, gerada pelo servidor. Nunca o nome do arquivo.
  storage_key       text        NOT NULL,
  -- Conferido pelos bytes do arquivo, nunca pela extensão (AC-204).
  mime_type         text        NOT NULL,
  byte_size         bigint      NOT NULL,
  sha256            bytea       NOT NULL,
  -- Metadado para a tela: o nome que a pessoa reconhece. Nunca vira caminho.
  original_filename text,
  uploaded_by       uuid        NOT NULL REFERENCES app.identities (id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_contracts_kind_ck
    CHECK (kind IN ('CONTRACT', 'ID_DOC', 'ADDRESS_PROOF')),
  CONSTRAINT store_contracts_mime_ck
    CHECK (mime_type IN ('application/pdf', 'image/png', 'image/jpeg')),
  CONSTRAINT store_contracts_tamanho_ck
    CHECK (byte_size > 0),
  CONSTRAINT store_contracts_resumo_ck
    CHECK (octet_length(sha256) = 32)
);

-- Única POR LOJA, e não global: chave única global em tabela de loja é canal
-- encoberto (guarda G3). A chave já é aleatória; a loja na frente só a
-- mantém do lado certo da regra.
CREATE UNIQUE INDEX IF NOT EXISTS store_contracts_chave_uk
  ON app.store_contracts (store_id, storage_key);
CREATE INDEX IF NOT EXISTS store_contracts_loja_ix
  ON app.store_contracts (store_id, kind, created_at DESC);

ALTER TABLE app.store_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.store_contracts FORCE  ROW LEVEL SECURITY;

-- Nenhuma política para `sc_app`, de propósito (modelo de dados,
-- `store_contracts`): contrato e documento de identidade não são alcançáveis
-- pela conexão das lojas em circunstância nenhuma.
CREATE POLICY contracts_admin_all ON app.store_contracts FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);

-- Duas camadas, como nas outras decisões de "só a administração": a política
-- nega por omissão, e o privilégio retirado barra antes de a política ser
-- consultada. O padrão do esquema concede leitura e escrita a `sc_app` em
-- toda tabela nova; aqui ele é desfeito.
REVOKE ALL ON app.store_contracts FROM sc_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.store_contracts TO sc_admin;
