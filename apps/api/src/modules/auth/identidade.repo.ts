/**
 * Persistência da identidade: cadastro, login, verificação de e-mail,
 * recuperação de senha e convite do dono (T-111, AC-129, AC-131).
 *
 * Implementa as portas que os casos de uso já declaram — a regra continua
 * neles. Tudo passa pelo caminho único até o banco (`core/db.ts`, P-004) e
 * pela credencial que atende requisição: os passos anteriores à sessão chamam
 * as funções dedicadas das migrações 0045 e 0046, que devolvem a lista fechada de
 * campos de cada passo. Este arquivo não abre conexão, não guarda estado e
 * não sabe o que é Argon2id: recebe resumo e derivação prontos.
 *
 * Cada método abre a própria transação quando chamado fora de uma — e entra
 * na da requisição quando ela já existe (`emTransacao` reaproveita a que está
 * em curso). É isso que deixa a rota juntar dois passos numa transação só,
 * como o reenvio do link de verificação pede.
 */

import type { AcessoAoBanco } from "../../core/db.ts";
import type {
  CodigoDeVerificacao,
  CodigosRepo,
  IdentidadeDeVerificacao,
  ResultadoDaAutorizacaoDeReenvio,
  ResultadoDoConsumoDoCodigo,
} from "./codigos.repo.ts";
import type { RepositorioDeConvites } from "./convite.usecase.ts";
import type {
  IdentidadeParaLogin,
  PapelNoLogin,
  RepositorioDeIdentidadesParaLogin,
} from "./login.usecase.ts";
import type {
  IdentidadeParaRecuperacao,
  RepositorioDeRecuperacaoDeSenha,
} from "./recuperar-senha.usecase.ts";
import type {
  NovaIdentidade,
  RepositorioDeIdentidades,
} from "./register.usecase.ts";
import type { PapelDaSessao } from "./token.ts";

/** Como o repositório alcança o banco. Preguiçoso: montar não abre conexão. */
export type AcessoDoRepositorio = () => AcessoAoBanco;

// ---------------------------------------------------------------------------
// Papel
// ---------------------------------------------------------------------------

/** Papel que o banco calcula (`app.auth_papel_da_identidade`). */
type PapelNoBanco = "CUSTOMER" | "OWNER" | "ADMIN";

const PAPEL_NO_LOGIN: Readonly<Record<PapelNoBanco, PapelNoLogin>> = {
  CUSTOMER: "CLIENTE",
  OWNER: "DONO",
  ADMIN: "ADMINISTRADOR",
};

/** O papel do login no vocabulário da sessão e do token. */
export const PAPEL_DA_SESSAO: Readonly<Record<PapelNoLogin, PapelDaSessao>> = {
  CLIENTE: "CUSTOMER",
  DONO: "OWNER",
  ADMINISTRADOR: "ADMIN",
};

function papelNoLogin(papel: string): PapelNoLogin {
  const traduzido = PAPEL_NO_LOGIN[papel as PapelNoBanco];
  if (traduzido === undefined) {
    throw new Error(`papel desconhecido vindo do banco: ${papel}`);
  }
  return traduzido;
}

// ---------------------------------------------------------------------------
// Cadastro (AC-100): conta de cliente já verificada (migração 0047)
// ---------------------------------------------------------------------------

/** O cadastro de cliente final no banco. */
export function repositorioDeIdentidadesNoBanco(
  acesso: AcessoDoRepositorio,
): RepositorioDeIdentidades & {
  /**
   * Conta pendente de verificação, pelo caminho antigo (migração 0045). O
   * cadastro não usa mais; fica para as provas do link de verificação, que
   * continua valendo para as contas antigas.
   */
  criarPendenteSeAusente(
    identidade: NovaIdentidade,
  ): Promise<{ readonly criada: boolean }>;
} {
  return {
    async criarPendenteSeAusente(identidade: NovaIdentidade) {
      const [linha] = await acesso().emTransacao(
        (tx) =>
          tx.$queryRaw<{ criada: boolean }[]>`
          SELECT app.auth_cadastrar_identidade(
                   ${identidade.emailNormalizado}, ${identidade.nome},
                   ${identidade.telefoneE164}, ${identidade.senhaDerivada}) AS criada`,
      );
      return { criada: linha?.criada === true };
    },
    async criarVerificadaSeAusente(identidade: NovaIdentidade) {
      const [linha] = await acesso().emTransacao(
        (tx) =>
          tx.$queryRaw<{ id: string | null }[]>`
          SELECT app.auth_cadastrar_cliente_verificado(
                   ${identidade.emailNormalizado}, ${identidade.nome},
                   ${identidade.telefoneE164}, ${identidade.senhaDerivada})::text AS id`,
      );
      const id = linha?.id ?? null;
      return id === null ? null : { identidadeId: id };
    },
  };
}

// ---------------------------------------------------------------------------
// Login (AC-105, AC-108, AC-121, AC-122)
// ---------------------------------------------------------------------------

/**
 * O que o login lê do banco: o que a porta pede, mais o que a rota precisa
 * para escolher o canal do segundo fator sem uma segunda ida ao banco.
 */
export interface IdentidadeParaLoginNoBanco extends IdentidadeParaLogin {
  readonly nome: string;
  /** Aplicativo autenticador ativo: o código por e-mail deixa de valer (AC-121). */
  readonly aplicativoAtivo: boolean;
}

interface LinhaDoLogin {
  readonly identidade_id: string;
  readonly endereco: string;
  readonly nome: string | null;
  readonly senha_hash: string;
  readonly email_verificado: boolean;
  readonly papel: string;
  readonly totp_ativo: boolean;
}

/** A leitura do login no banco. Conta sem senha ou anonimizada não aparece. */
export function repositorioDoLoginNoBanco(acesso: AcessoDoRepositorio): {
  buscarPorEmail(
    emailNormalizado: string,
  ): Promise<IdentidadeParaLoginNoBanco | null>;
} & RepositorioDeIdentidadesParaLogin {
  return {
    async buscarPorEmail(emailNormalizado: string) {
      const [linha] = await acesso().emTransacao(
        (tx) =>
          tx.$queryRaw<LinhaDoLogin[]>`
          SELECT * FROM app.auth_identidade_para_login(${emailNormalizado})`,
      );
      if (linha === undefined) return null;
      return {
        id: linha.identidade_id,
        email: linha.endereco,
        nome: linha.nome ?? "",
        senhaHash: linha.senha_hash,
        emailVerificado: linha.email_verificado,
        papel: papelNoLogin(linha.papel),
        // Para o cliente, ativar o segundo fator é ativar o aplicativo
        // (AC-108); dono e administração sempre passam por um segundo fator.
        segundoFatorAtivado: linha.totp_ativo,
        aplicativoAtivo: linha.totp_ativo,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Verificação de e-mail (AC-103, AC-104)
// ---------------------------------------------------------------------------

interface LinhaDeVerificacao {
  readonly situacao: string;
  readonly identidade_id: string | null;
  readonly endereco: string | null;
  readonly nome: string | null;
  readonly verificado_em: Date | null;
}

function identidadeDaLinha(linha: LinhaDeVerificacao): IdentidadeDeVerificacao {
  if (linha.identidade_id === null || linha.endereco === null) {
    throw new Error("o banco liberou a verificação sem dizer de quem");
  }
  return {
    id: linha.identidade_id,
    email: linha.endereco,
    nome: linha.nome ?? "",
    emailVerificadoEm: linha.verificado_em,
  };
}

/** Pedido do primeiro link de verificação, logo depois do cadastro. */
export interface PrimeiroLinkDeVerificacao {
  readonly id: string;
  readonly resumoDoToken: string;
  readonly expiraEm: Date;
  readonly enviadoEm: Date;
}

/** Os links de verificação no banco, mais o primeiro link do cadastro. */
export interface CodigosRepoNoBanco extends CodigosRepo {
  /**
   * Cria o primeiro link para a conta pendente com aquele e-mail. Devolve
   * `null` quando não há conta pendente — conta já verificada não ganha link,
   * e quem chama segue com a mesma resposta (AC-101).
   */
  criarVerificacaoParaEmail(
    emailNormalizado: string,
    link: PrimeiroLinkDeVerificacao,
  ): Promise<{ readonly identidadeId: string; readonly nome: string } | null>;
}

export function codigosRepoNoBanco(
  acesso: AcessoDoRepositorio,
): CodigosRepoNoBanco {
  return {
    async consumirVerificacao(
      resumoDoToken: string,
      agora: Date,
    ): Promise<ResultadoDoConsumoDoCodigo> {
      const [linha] = await acesso().emTransacao(
        (tx) =>
          tx.$queryRaw<LinhaDeVerificacao[]>`
          SELECT * FROM app.auth_consumir_verificacao_de_email(
                          ${resumoDoToken}, ${agora}::timestamptz)`,
      );
      if (linha?.situacao === "verificado") {
        return { situacao: "verificado", identidade: identidadeDaLinha(linha) };
      }
      return linha?.situacao === "expirado"
        ? { situacao: "expirado" }
        : { situacao: "invalido" };
    },

    async autorizarReenvioDeLinkExpirado(
      resumoDoToken: string,
      agora: Date,
      limite: number,
      janelaEmMs: number,
    ): Promise<ResultadoDaAutorizacaoDeReenvio> {
      const [linha] = await acesso().emTransacao(
        (tx) =>
          tx.$queryRaw<(LinhaDeVerificacao & { disponivel_em: Date | null })[]>`
          SELECT * FROM app.auth_autorizar_reenvio_de_verificacao(
                          ${resumoDoToken}, ${agora}::timestamptz,
                          ${limite}::integer, ${janelaEmMs}::bigint)`,
      );
      if (linha?.situacao === "liberado") {
        return { situacao: "liberado", identidade: identidadeDaLinha(linha) };
      }
      if (linha?.situacao === "limite_atingido" && linha.disponivel_em) {
        return {
          situacao: "limite_atingido",
          disponivelEm: linha.disponivel_em,
        };
      }
      return { situacao: "invalido" };
    },

    async criarVerificacao(codigo: CodigoDeVerificacao): Promise<void> {
      await acesso().emTransacao(
        (tx) =>
          tx.$executeRaw`
          SELECT app.auth_criar_verificacao_de_email(
                   ${codigo.id}::uuid, ${codigo.identidadeId}::uuid,
                   ${codigo.resumoDoToken}, ${codigo.expiraEm}::timestamptz,
                   ${codigo.enviadoEm}::timestamptz)`,
      );
    },

    async criarVerificacaoParaEmail(emailNormalizado, link) {
      const [linha] = await acesso().emTransacao(
        (tx) =>
          tx.$queryRaw<{ identidade_id: string; nome: string | null }[]>`
          SELECT * FROM app.auth_criar_verificacao_por_email(
                          ${link.id}::uuid, ${emailNormalizado},
                          ${link.resumoDoToken}, ${link.expiraEm}::timestamptz,
                          ${link.enviadoEm}::timestamptz)`,
      );
      if (linha === undefined) return null;
      return { identidadeId: linha.identidade_id, nome: linha.nome ?? "" };
    },
  };
}

// ---------------------------------------------------------------------------
// Recuperação de senha (AC-114, AC-115)
// ---------------------------------------------------------------------------

/**
 * A conta não aceita pedido de recuperação (desativada ou anonimizada no meio
 * do caminho). Nunca chega à pessoa: o caso de uso responde o texto neutro.
 */
export class ErroDeContaSemRecuperacao extends Error {
  constructor() {
    super("a conta não aceita pedido de recuperação");
    this.name = "ErroDeContaSemRecuperacao";
  }
}

/** O código do PostgreSQL dentro do erro que o Prisma embrulha. */
function codigoDoPostgres(erro: unknown): string | undefined {
  const embrulhado = erro as
    | {
        readonly message?: unknown;
        readonly meta?: {
          readonly driverAdapterError?: {
            readonly cause?: { readonly code?: unknown };
          };
        };
      }
    | undefined;
  const doAdaptador = embrulhado?.meta?.driverAdapterError?.cause?.code;
  if (typeof doAdaptador === "string") return doAdaptador;
  return /Code: `([0-9A-Za-z]+)`/.exec(String(embrulhado?.message ?? ""))?.[1];
}

export function repositorioDeRecuperacaoNoBanco(
  acesso: AcessoDoRepositorio,
): RepositorioDeRecuperacaoDeSenha {
  return {
    async encontrarPorEmailNormalizado(
      emailNormalizado: string,
    ): Promise<IdentidadeParaRecuperacao | null> {
      const [linha] = await acesso().emTransacao(
        (tx) =>
          tx.$queryRaw<{ identidade_id: string; endereco: string }[]>`
          SELECT * FROM app.auth_identidade_para_recuperacao(${emailNormalizado})`,
      );
      return linha === undefined
        ? null
        : { id: linha.identidade_id, email: linha.endereco };
    },

    async criarPedido(pedido) {
      // A conta pode ter sido desativada (ou anonimizada) entre a busca por
      // e-mail e este passo: a função recusa com P0002. Num SAVEPOINT, para a
      // recusa não abortar a transação da requisição — que ainda precisa
      // terminar e responder o texto neutro de sempre (card #170, D-2). A
      // recusa sobe como erro próprio: o caso de uso não manda e-mail e
      // responde igual a conta inexistente.
      await acesso().emTransacao(async (tx) => {
        await tx.$executeRaw`SAVEPOINT pedido_de_recuperacao`;
        try {
          await tx.$executeRaw`
            SELECT app.auth_criar_pedido_de_recuperacao(
                     ${pedido.identidadeId}::uuid, ${pedido.resumoDoToken},
                     ${pedido.expiraEm}::timestamptz)`;
        } catch (causa) {
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT pedido_de_recuperacao`;
          if (codigoDoPostgres(causa) === "P0002") {
            throw new ErroDeContaSemRecuperacao();
          }
          throw causa;
        }
        await tx.$executeRaw`RELEASE SAVEPOINT pedido_de_recuperacao`;
      });
    },

    async consumirPedidoERedefinirSenha(dados) {
      const [linha] = await acesso().emTransacao(
        (tx) =>
          tx.$queryRaw<{ aplicada: boolean }[]>`
          SELECT app.auth_redefinir_senha_pelo_pedido(
                   ${dados.resumoDoToken}, ${dados.hashDaSenha},
                   ${dados.agora}::timestamptz) AS aplicada`,
      );
      return linha?.aplicada === true;
    },
  };
}

// ---------------------------------------------------------------------------
// Convite do dono (AC-103, AC-200)
// ---------------------------------------------------------------------------

/**
 * O lado do convite que é da identidade: aceitar (antes da sessão, pela
 * credencial das lojas) e reenviar (ato da administração, pela credencial
 * dela). Criar a loja com o convite é do cadastro da administração
 * (`modules/admin`, T-200), que já grava loja, dono e convite numa transação.
 */
export type RepositorioDoConviteDoDono = Pick<
  RepositorioDeConvites,
  "consumirConviteEDefinirSenha" | "reenviarConvite"
>;

export function repositorioDoConviteNoBanco(acessos: {
  readonly aplicacao: AcessoDoRepositorio;
  readonly administracao: AcessoDoRepositorio;
}): RepositorioDoConviteDoDono {
  return {
    async consumirConviteEDefinirSenha(dados) {
      const [linha] = await acessos.aplicacao().emTransacao(
        (tx) =>
          tx.$queryRaw<{ aceito: boolean }[]>`
          SELECT app.auth_aceitar_convite(
                   ${dados.resumoDoToken}, ${dados.hashDaSenha},
                   ${dados.agora}::timestamptz) AS aceito`,
      );
      return linha?.aceito === true;
    },

    /**
     * Troca o link do convite ainda não aceito (o anterior deixa de valer) e
     * deixa o reenvio na trilha da loja, com quem o pediu: a administração da
     * requisição em curso (`app.current_user_id()`). Convite já aceito não
     * volta a valer — devolve `null`.
     */
    async reenviarConvite(dados) {
      return acessos.administracao().emTransacao(async (tx) => {
        const [linha] = await tx.$queryRaw<
          { vinculo_id: string; endereco: string; nome: string | null }[]
        >`
          UPDATE app.store_members m
             SET invite_token_hash = ${dados.resumoDoToken},
                 invite_expires_at = ${dados.expiraEm}::timestamptz
            FROM app.identities i, app.stores s
           WHERE m.store_id = ${dados.lojaId}::uuid
             AND m.role = 'OWNER'
             AND m.invite_accepted_at IS NULL
             AND m.revoked_at IS NULL
             AND i.id = m.identity_id
             AND i.anonymized_at IS NULL
             AND s.id = m.store_id
             AND s.deleted_at IS NULL
          RETURNING m.id::text AS vinculo_id, i.email_norm AS endereco,
                    i.display_name AS nome`;
        if (linha === undefined) return null;

        // Na trilha vai o identificador do vínculo, nunca o e-mail (P-009).
        await tx.$executeRaw`
          INSERT INTO app.audit_log
            (store_id, actor_id, actor_role, action, entity, entity_id)
          VALUES (${dados.lojaId}::uuid, app.current_user_id(), 'ADMIN',
                  'CONVITE_REENVIADO', 'store_members', ${linha.vinculo_id})`;
        return { email: linha.endereco, nome: linha.nome ?? "" };
      });
    },
  };
}
