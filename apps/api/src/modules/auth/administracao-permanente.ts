/**
 * Administração permanente de staging e produção (card #3).
 *
 * A API, ao subir, cria UMA administração a partir das variáveis do serviço
 * (`ADMIN_EMAIL`, `ADMIN_SENHA`, `ADMIN_TOTP_SEGREDO`, `ADMIN_NOME`), para quem
 * opera não precisar rodar o `arranque` interativo. Como a administração fora de
 * `development` SEMPRE exige o aplicativo autenticador (AC-122), o segredo do
 * aplicativo vem junto: a conta nasce com ele já confirmado, cifrado pelo mesmo
 * caminho do 2FA normal.
 *
 * Regras (todas relidas sob `pg_try_advisory_xact_lock`, a MESMA trava da
 * primeira administração, então as duas rotas nunca criam juntas):
 *
 * - só CRIA quando `app.platform_admins` não tem NENHUMA linha (nem revogada),
 *   não há marca `ADMINISTRACAO_PERMANENTE_CRIADA` na trilha da plataforma e
 *   não existe identidade com o e-mail. Trocar o `ADMIN_EMAIL`, revogar o único
 *   administrador ou voltar variáveis antigas por rollback NUNCA cria outro;
 * - nunca promove conta existente, nunca reativa grant revogado, nunca troca
 *   senha nem segredo de quem já existe;
 * - grava uma linha em `app.audit_platform` (sem e-mail, senha nem segredo);
 * - não grava códigos de recuperação nem aceites: a pessoa os gera e aceita no
 *   primeiro login;
 * - `last_used_step` fica nulo: nenhum código foi conferido aqui, e quem tem o
 *   segredo gera qualquer código — por isso o segredo precisa ser trocado no
 *   primeiro acesso (a partida avisa enquanto ele valer).
 */

import type { CifradorDeSegredos } from "../../core/cifra.ts";
import {
  CHAVE_DA_TRAVA,
  type ConexaoDaAdministracao,
} from "./primeira-administracao.ts";
import { avaliarPoliticaDeSenha, derivarSenha } from "./senha.ts";

export const ACAO_DA_ADMINISTRACAO_PERMANENTE =
  "ADMINISTRACAO_PERMANENTE_CRIADA";

/** Mesma entidade da ficha da pessoa (`ENTIDADE_DA_PESSOA` em modules/admin). */
const ENTIDADE_NA_TRILHA = "identity";

export type SituacaoDaAdministracaoPermanente =
  | "criada"
  | "ja_existia"
  | "segredo_de_bootstrap_ainda_ativo"
  | "ja_ha_administracao"
  | "conta_sem_administracao"
  | "administracao_revogada"
  | "senha_fraca"
  | "ocupada";

export interface PedidoDaAdministracaoPermanenteNoBanco {
  /** UMA conexão: BEGIN, trava e COMMIT precisam ser a mesma sessão. */
  readonly conexao: ConexaoDaAdministracao;
  readonly email: string;
  readonly senha: string;
  readonly segredo: string;
  readonly nome: string;
  readonly cifrador: CifradorDeSegredos;
}

async function ler(
  conexao: ConexaoDaAdministracao,
  texto: string,
  valores?: unknown[],
) {
  return (await conexao.query(texto, valores)).rows;
}

export async function garantirAdministracaoPermanente(
  pedido: PedidoDaAdministracaoPermanenteNoBanco,
): Promise<SituacaoDaAdministracaoPermanente> {
  const { conexao, email, senha, segredo, nome, cifrador } = pedido;
  if (!avaliarPoliticaDeSenha(senha).valida) return "senha_fraca";

  // Caro e sem banco: antes da transação, para ela ser curta.
  const senhaDerivada = await derivarSenha(senha);
  const segredoCifrado = await cifrador.cifrar(segredo);

  await conexao.query("BEGIN");
  try {
    await conexao.query("SET LOCAL lock_timeout = '3s'");
    await conexao.query("SET LOCAL statement_timeout = '5s'");
    const trava = await ler(
      conexao,
      "SELECT pg_try_advisory_xact_lock($1) AS ok",
      [CHAVE_DA_TRAVA],
    );
    if (trava[0]?.ok !== true) {
      await conexao.query("ROLLBACK");
      return "ocupada";
    }

    const conta = (
      await ler(
        conexao,
        `SELECT i.id::text AS id,
                (SELECT a.revoked_at IS NULL FROM app.platform_admins a WHERE a.identity_id = i.id) AS ativa,
                EXISTS (SELECT 1 FROM app.platform_admins a WHERE a.identity_id = i.id) AS foi_admin
           FROM app.identities i WHERE i.email_norm = $1`,
        [email],
      )
    )[0];

    if (conta !== undefined) {
      let situacao: SituacaoDaAdministracaoPermanente;
      if (conta.foi_admin !== true) situacao = "conta_sem_administracao";
      else if (conta.ativa !== true) situacao = "administracao_revogada";
      else {
        situacao = await segredoAindaAtivo(
          conexao,
          cifrador,
          String(conta.id),
          segredo,
        );
      }
      await conexao.query("ROLLBACK");
      return situacao;
    }

    const outras = await ler(
      conexao,
      `SELECT (SELECT count(*) FROM app.platform_admins) AS admins,
              EXISTS (SELECT 1 FROM app.audit_platform WHERE action = $1) AS marca`,
      [ACAO_DA_ADMINISTRACAO_PERMANENTE],
    );
    if (Number(outras[0]?.admins ?? 0) > 0 || outras[0]?.marca === true) {
      await conexao.query("ROLLBACK");
      return "ja_ha_administracao";
    }

    const criada = await conexao.query(
      `INSERT INTO app.identities (email_norm, password_hash, email_verified_at, display_name)
       VALUES ($1, $2, now(), $3) RETURNING id::text AS id`,
      [email, senhaDerivada, nome],
    );
    const identidadeId = String(criada.rows[0]?.id);
    await conexao.query(
      `INSERT INTO app.platform_admins (identity_id, granted_by) VALUES ($1::uuid, NULL)`,
      [identidadeId],
    );
    await conexao.query(
      `INSERT INTO app.totp_credentials (identity_id, secret_enc, confirmed_at, last_used_step)
       VALUES ($1::uuid, $2, now(), NULL)`,
      [identidadeId, segredoCifrado],
    );
    await conexao.query(
      `INSERT INTO app.audit_platform (actor_id, actor_role, action, entity, entity_id, after_data)
       VALUES (NULL, 'SYSTEM', $1, $2, $3, $4::jsonb)`,
      [
        ACAO_DA_ADMINISTRACAO_PERMANENTE,
        ENTIDADE_NA_TRILHA,
        identidadeId,
        JSON.stringify({
          origem: "variaveis_de_ambiente",
          segundoFator: "aplicativo",
        }),
      ],
    );
    await conexao.query("COMMIT");
    return "criada";
  } catch (causa) {
    await conexao.query("ROLLBACK").catch(() => undefined);
    throw causa;
  }
}

/**
 * Conta que já existe e é administração: o segredo do bootstrap ainda é o do
 * aplicativo ativo? Então quem lê as variáveis do serviço tem o segundo fator.
 */
async function segredoAindaAtivo(
  conexao: ConexaoDaAdministracao,
  cifrador: CifradorDeSegredos,
  identidadeId: string,
  segredo: string,
): Promise<SituacaoDaAdministracaoPermanente> {
  const marca = await ler(
    conexao,
    `SELECT 1 FROM app.audit_platform WHERE action = $1 AND entity_id = $2 LIMIT 1`,
    [ACAO_DA_ADMINISTRACAO_PERMANENTE, identidadeId],
  );
  if (marca.length === 0) return "ja_existia";
  const ativas = await ler(
    conexao,
    `SELECT secret_enc FROM app.totp_credentials
      WHERE identity_id = $1::uuid AND confirmed_at IS NOT NULL AND disabled_at IS NULL`,
    [identidadeId],
  );
  for (const linha of ativas) {
    try {
      if ((await cifrador.decifrar(String(linha.secret_enc))) === segredo) {
        return "segredo_de_bootstrap_ainda_ativo";
      }
    } catch {
      // Cifrado com outra chave: não é o segredo do bootstrap.
    }
  }
  return "ja_existia";
}
