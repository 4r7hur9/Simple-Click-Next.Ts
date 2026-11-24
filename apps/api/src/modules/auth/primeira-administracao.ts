/**
 * Primeira administração da plataforma (T-024, AC-050 e AC-051).
 *
 * Cria, uma vez só, a identidade que administra a plataforma num banco de
 * produção recém-arrancado. Quem chama é o arranque (`apps/api/src/arranque.ts`),
 * com a credencial de ADMINISTRAÇÃO (`sc_admin`): é a única que tem política
 * para gravar em `platform_admins`, e usar a de migração seria passar por cima
 * do isolamento justamente no ato mais sensível.
 *
 * A administração nasce com o aplicativo autenticador já confirmado, porque
 * administração sem aplicativo não abre sessão (AC-122) e ficaria trancada do
 * lado de fora. O operador cadastra a chave no aplicativo e digita o código
 * que ele mostra; só com o código certo algo é gravado. O passo desse código
 * fica marcado como usado, então ele não serve de novo no primeiro login.
 *
 * Idempotente: com a mesma administração já criada, termina sem alterar nada.
 * Qualquer outra situação estranha (outra administração, e-mail de uma conta
 * comum) é recusa, nunca promoção silenciosa.
 */

import { z } from "zod";

import type { CifradorDeSegredos } from "../../core/cifra.ts";
import {
  criarCodigosDeRecuperacao,
  type CodigoDeRecuperacaoPersistido,
} from "./recovery-codes.ts";
import { avaliarPoliticaDeSenha, derivarSenha } from "./senha.ts";
import {
  comparacaoSeguraTotp,
  gerarCodigoTotp,
  prepararAtivacaoTotp,
  type RepositorioTotp,
} from "./totp.usecase.ts";

/** O mínimo de banco de que a criação precisa: o `pg.Client` serve. */
export interface ConexaoDaAdministracao {
  query(
    texto: string,
    valores?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

/** O que o operador vê para cadastrar o aplicativo autenticador. */
export interface ConviteDoAplicativo {
  /** Link `otpauth://` (o mesmo que a tela de ativação mostra). */
  readonly uri: string;
  /** A chave em texto, para digitar no aplicativo. */
  readonly chave: string;
}

export interface PedidoDaPrimeiraAdministracao {
  readonly conexao: ConexaoDaAdministracao;
  readonly email: string;
  readonly senha: string;
  readonly nome?: string | undefined;
  readonly cifrador: CifradorDeSegredos;
  /** Mostra o convite ao operador e devolve o código que ele digitou. */
  readonly lerCodigoDoAplicativo: (
    convite: ConviteDoAplicativo,
  ) => Promise<string>;
  readonly agora?: () => Date;
}

export type ResultadoDaPrimeiraAdministracao =
  | {
      readonly situacao: "criada";
      readonly identidadeId: string;
      readonly codigosDeRecuperacao: readonly string[];
    }
  | { readonly situacao: "ja_existia"; readonly identidadeId: string };

export type MotivoDaRecusa =
  | "email_invalido"
  | "senha_fraca"
  | "ja_ha_administracao"
  | "email_de_outra_conta"
  | "codigo_do_aplicativo_incorreto";

/** Recusa com motivo. A mensagem nunca traz a senha. */
export class ErroDaPrimeiraAdministracao extends Error {
  readonly motivo: MotivoDaRecusa;

  constructor(motivo: MotivoDaRecusa, mensagem: string) {
    super(mensagem);
    this.name = "ErroDaPrimeiraAdministracao";
    this.motivo = motivo;
  }
}

const PASSO_EM_MS = 30_000;
/** Trava da transação: duas execuções ao mesmo tempo não criam duas. */
export const CHAVE_DA_TRAVA = 8_310_024;

const esquemaDoEmail = z.string().trim().toLowerCase().max(254).pipe(z.email());

/**
 * Confere e-mail e senha antes de qualquer acesso ao banco e devolve o e-mail
 * normalizado. O arranque chama isto primeiro, para recusar sem tocar em nada.
 */
export function conferirPedidoDaAdministracao(
  emailInformado: string,
  senha: string,
): string {
  const lido = esquemaDoEmail.safeParse(emailInformado);
  if (!lido.success) {
    throw new ErroDaPrimeiraAdministracao(
      "email_invalido",
      "O e-mail da primeira administração não é válido.",
    );
  }
  const politica = avaliarPoliticaDeSenha(senha);
  if (!politica.valida) {
    throw new ErroDaPrimeiraAdministracao(
      "senha_fraca",
      `A senha da primeira administração não serve: ${politica.problemas
        .map((problema) => problema.mensagem)
        .join(" ")}`,
    );
  }
  return lido.data;
}

/** Como está a administração no banco, para o e-mail pedido. */
async function lerSituacao(conexao: ConexaoDaAdministracao, email: string) {
  const administracoes = await conexao.query(
    `SELECT a.identity_id::text AS id, i.email_norm AS email,
            EXISTS (SELECT 1 FROM app.totp_credentials t
                     WHERE t.identity_id = a.identity_id
                       AND t.confirmed_at IS NOT NULL
                       AND t.disabled_at IS NULL) AS aplicativo
       FROM app.platform_admins a
       JOIN app.identities i ON i.id = a.identity_id
      WHERE a.revoked_at IS NULL`,
  );
  const conta = await conexao.query(
    `SELECT id::text AS id FROM app.identities WHERE email_norm = $1`,
    [email],
  );
  return {
    administracoes: administracoes.rows as {
      id: string;
      email: string;
      aplicativo: boolean;
    }[],
    contaComOEmail: conta.rows[0]?.id as string | undefined,
  };
}

/** Recusa o que não pode virar a primeira administração; devolve se já existe. */
function decidir(
  situacao: Awaited<ReturnType<typeof lerSituacao>>,
  email: string,
): string | undefined {
  const mesma = situacao.administracoes.find((a) => a.email === email);
  if (mesma !== undefined && mesma.aplicativo === true) return mesma.id;
  if (situacao.administracoes.length > 0) {
    throw new ErroDaPrimeiraAdministracao(
      "ja_ha_administracao",
      "A plataforma já tem administração ativa. O arranque só cria a primeira; nada foi gravado.",
    );
  }
  if (situacao.contaComOEmail !== undefined) {
    throw new ErroDaPrimeiraAdministracao(
      "email_de_outra_conta",
      "Este e-mail já é de uma conta que não é administração. O arranque não promove conta existente; nada foi gravado.",
    );
  }
  return undefined;
}

/** O passo do aplicativo em que o código confere (janela de ±1 passo). */
function passoQueConfere(
  segredo: string,
  codigo: string,
  agora: Date,
): number | undefined {
  const atual = Math.floor(agora.getTime() / PASSO_EM_MS);
  for (const passo of [atual - 1, atual, atual + 1]) {
    const esperado = gerarCodigoTotp(segredo, new Date(passo * PASSO_EM_MS));
    if (comparacaoSeguraTotp(esperado, codigo.trim())) return passo;
  }
  return undefined;
}

/** Sorteia o segredo e cifra pelo mesmo caminho da tela de ativação. */
async function sortearAplicativo(
  email: string,
  cifrador: CifradorDeSegredos,
): Promise<{ segredo: string; uri: string; cifrado: string }> {
  let cifrado = "";
  const naoUsado = () =>
    Promise.reject(new Error("não usado no arranque da administração"));
  const guardarSoNaMemoria: RepositorioTotp = {
    guardarPendente: async (credencial) => {
      cifrado = credencial.segredoCifrado;
    },
    ativarSeCodigoConfere: naoUsado,
    buscar: naoUsado,
    validarEConsumir: naoUsado,
  };
  const preparada = await prepararAtivacaoTotp("arranque", email, {
    repositorio: guardarSoNaMemoria,
    cifrador,
  });
  return {
    segredo: preparada.segredo,
    uri: preparada.uriDoAplicativo,
    cifrado,
  };
}

/**
 * Cria a primeira administração, ou confirma que ela já existe.
 *
 * O código do aplicativo é pedido FORA da transação (o operador leva tempo
 * para cadastrar a chave) e a situação é lida de novo dentro dela, sob trava.
 */
export async function criarPrimeiraAdministracao(
  pedido: PedidoDaPrimeiraAdministracao,
): Promise<ResultadoDaPrimeiraAdministracao> {
  const { conexao, cifrador, agora = () => new Date() } = pedido;
  const email = conferirPedidoDaAdministracao(pedido.email, pedido.senha);

  const existente = decidir(await lerSituacao(conexao, email), email);
  if (existente !== undefined) {
    return { situacao: "ja_existia", identidadeId: existente };
  }

  const aplicativo = await sortearAplicativo(email, cifrador);
  const codigo = await pedido.lerCodigoDoAplicativo({
    uri: aplicativo.uri,
    chave: aplicativo.segredo,
  });
  const passo = passoQueConfere(aplicativo.segredo, codigo, agora());
  if (passo === undefined) {
    throw new ErroDaPrimeiraAdministracao(
      "codigo_do_aplicativo_incorreto",
      "O código do aplicativo não confere. Nada foi gravado: rode o arranque de novo e cadastre a chave nova.",
    );
  }
  const senhaDerivada = await derivarSenha(pedido.senha);

  await conexao.query("BEGIN");
  try {
    await conexao.query("SELECT pg_advisory_xact_lock($1)", [CHAVE_DA_TRAVA]);
    const deNovo = decidir(await lerSituacao(conexao, email), email);
    if (deNovo !== undefined) {
      await conexao.query("ROLLBACK");
      return { situacao: "ja_existia", identidadeId: deNovo };
    }

    const criada = await conexao.query(
      `INSERT INTO app.identities (email_norm, password_hash, email_verified_at, display_name)
       VALUES ($1, $2, now(), $3) RETURNING id::text AS id`,
      [email, senhaDerivada, pedido.nome?.trim() || "Administração"],
    );
    const identidadeId = String(criada.rows[0]?.id);

    await conexao.query(
      `INSERT INTO app.platform_admins (identity_id, granted_by) VALUES ($1::uuid, NULL)`,
      [identidadeId],
    );
    await conexao.query(
      `INSERT INTO app.totp_credentials (identity_id, secret_enc, confirmed_at, last_used_step)
       VALUES ($1::uuid, $2, now(), $3)`,
      [identidadeId, aplicativo.cifrado, passo],
    );
    const codigosDeRecuperacao = await criarCodigosDeRecuperacao(identidadeId, {
      criar: async (codigos: readonly CodigoDeRecuperacaoPersistido[]) => {
        await conexao.query(
          `INSERT INTO app.recovery_codes (identity_id, code_sha256)
             SELECT $1::uuid, resumo FROM unnest($2::text[]) AS resumo`,
          [identidadeId, codigos.map((item) => item.resumo)],
        );
      },
      consumir: () => Promise.resolve(false),
    });

    await conexao.query("COMMIT");
    return { situacao: "criada", identidadeId, codigosDeRecuperacao };
  } catch (causa) {
    await conexao.query("ROLLBACK");
    throw causa;
  }
}
