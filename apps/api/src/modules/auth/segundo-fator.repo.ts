/**
 * Persistência do segundo fator: desafio depois da senha, aplicativo
 * autenticador e códigos de recuperação (T-111; AC-105 a AC-107, AC-121 a
 * AC-124, AC-130).
 *
 * O que decide se um código vale mora aqui só no que é comparação; quem
 * decide o que fazer com o resultado continua sendo o caso de uso.
 *
 * - **Desafio** (`segundo-fator.usecase.ts`): conferir, contar a tentativa e
 *   consumir acontecem com o desafio travado no banco, numa transação — duas
 *   requisições com o mesmo código não viram duas sessões, e a quinta errada
 *   invalida o desafio (AC-107). O código por e-mail chega derivado
 *   (Argon2id) e é conferido aqui; o do aplicativo é conferido contra o
 *   segredo decifrado, e o passo usado só anda para a frente (AC-124).
 * - **Aplicativo** (`totp.usecase.ts`): ativar e consultar são de quem está
 *   logado (política "só a própria identidade"); conferir no login, antes da
 *   sessão, passa por função dedicada.
 * - **Recuperação** (`recovery-codes.ts`): gerar é de quem está logado;
 *   consumir, no login, é uma instrução só.
 *
 * Segredo que não decifra — adulterado, ou cifrado com outra chave — é código
 * recusado, nunca aceito (AC-130), e o registro diz só qual credencial falhou.
 */

import { randomInt, randomUUID } from "node:crypto";

import type { CifradorDeSegredos } from "../../core/cifra.ts";
import type { TransacaoDoBanco } from "../../core/db.ts";
import { registrar } from "../../core/log.ts";
import type { AcessoDoRepositorio } from "./identidade.repo.ts";
import type {
  CodigoDeRecuperacaoPersistido,
  RepositorioDeCodigosDeRecuperacao,
} from "./recovery-codes.ts";
import type {
  RepositorioDeDesafiosDeSegundoFator,
  ResultadoDaValidacaoDoDesafio,
} from "./segundo-fator.usecase.ts";
import { senhaConfere } from "./senha.ts";
import {
  comparacaoSeguraTotp,
  gerarCodigoTotp,
  type CredencialTotpCifrada,
  type RepositorioTotp,
} from "./totp.usecase.ts";

/** Quantos erros o desafio aceita antes de bloquear (AC-107). */
export const TENTATIVAS_DO_DESAFIO = 5;

/** Quanto o código de seis dígitos enviado por e-mail vale. */
export const PRAZO_DO_DESAFIO_EM_MS = 10 * 60 * 1000;

const PASSO_DO_APLICATIVO_EM_MS = 30_000;
/** Um passo para cada lado: o relógio do celular raramente está em dia. */
const PASSOS_DE_TOLERANCIA = 1;
const SEIS_DIGITOS = /^\d{6}$/;
const FORMATO_DE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O código de seis dígitos do desafio por e-mail, de fonte criptográfica. */
export function gerarCodigoDoDesafio(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * O passo do aplicativo em que o código informado confere, ou `null`.
 *
 * Só considera passos depois do último usado: o mesmo código, dentro da
 * janela em que ainda seria válido, não vale de novo (AC-124).
 */
interface ConferenciaDoAplicativo {
  readonly cifrador: CifradorDeSegredos;
  readonly credencialId: string;
  readonly segredoCifrado: string;
  readonly codigo: string;
  readonly agora: Date;
  readonly ultimoPasso: number | null;
}

async function passoQueConfere({
  cifrador,
  credencialId,
  segredoCifrado,
  codigo,
  agora,
  ultimoPasso,
}: ConferenciaDoAplicativo): Promise<number | null> {
  let segredo: string;
  try {
    segredo = await cifrador.decifrar(segredoCifrado);
  } catch (erro) {
    registrar.aviso("auth.totp.segredo_ilegivel", {
      recurso: "totp_credentials",
      recursoId: credencialId,
      detalhe: erro instanceof Error ? erro.name : "desconhecido",
    });
    return null;
  }
  if (!SEIS_DIGITOS.test(codigo)) return null;

  const passoAtual = Math.floor(agora.getTime() / PASSO_DO_APLICATIVO_EM_MS);
  for (
    let deslocamento = -PASSOS_DE_TOLERANCIA;
    deslocamento <= PASSOS_DE_TOLERANCIA;
    deslocamento += 1
  ) {
    const passo = passoAtual + deslocamento;
    if (ultimoPasso !== null && passo <= ultimoPasso) continue;
    const esperado = gerarCodigoTotp(
      segredo,
      new Date(passo * PASSO_DO_APLICATIVO_EM_MS),
    );
    if (comparacaoSeguraTotp(esperado, codigo)) return passo;
  }
  return null;
}

function numeroOuNulo(valor: bigint | number | null): number | null {
  return valor === null ? null : Number(valor);
}

// ---------------------------------------------------------------------------
// Desafio depois da senha (AC-105 a AC-107, AC-121, AC-122)
// ---------------------------------------------------------------------------

/** Canal do desafio: o código que mandamos por e-mail, ou o do aplicativo. */
export type CanalDoDesafio = "EMAIL" | "TOTP";

export interface PedidoDeDesafio {
  readonly identidadeId: string;
  readonly canal: CanalDoDesafio;
  /** Derivação Argon2id do código enviado; ausente no canal do aplicativo. */
  readonly codigoDerivado?: string;
  readonly expiraEm: Date;
  readonly agora: Date;
}

/** Os desafios no banco: a porta do caso de uso, mais a criação. */
export interface RepositorioDeDesafiosNoBanco extends RepositorioDeDesafiosDeSegundoFator {
  /**
   * Abre o desafio e invalida o anterior ainda aberto. O banco recusa código
   * por e-mail para quem tem aplicativo ativo (AC-121) e para a
   * administração (AC-122).
   */
  criar(pedido: PedidoDeDesafio): Promise<{ readonly desafioId: string }>;
}

interface LinhaDoDesafio {
  readonly identidade_id: string;
  readonly canal: string;
  readonly resumo: string | null;
  readonly tentativas: number;
  readonly expira_em: Date;
  readonly consumido_em: Date | null;
  readonly credencial_id: string | null;
  readonly segredo_cifrado: string | null;
  readonly ultimo_passo: bigint | number | null;
}

export function repositorioDeDesafiosNoBanco(
  acesso: AcessoDoRepositorio,
  dependencias: {
    readonly cifrador: CifradorDeSegredos;
    readonly agora?: () => Date;
    readonly gerarId?: () => string;
  },
): RepositorioDeDesafiosNoBanco {
  const agora = dependencias.agora ?? (() => new Date());
  const gerarId = dependencias.gerarId ?? randomUUID;

  return {
    async criar(pedido) {
      const desafioId = gerarId();
      await acesso().emTransacao(
        (tx) =>
          tx.$executeRaw`
          SELECT app.auth_criar_desafio(
                   ${desafioId}::uuid, ${pedido.identidadeId}::uuid,
                   ${pedido.canal}, ${pedido.codigoDerivado ?? null},
                   ${pedido.expiraEm}::timestamptz, ${pedido.agora}::timestamptz)`,
      );
      return { desafioId };
    },

    async validarEConsumir({
      desafioId,
      codigo,
    }): Promise<ResultadoDaValidacaoDoDesafio> {
      if (!FORMATO_DE_UUID.test(desafioId)) return { status: "INVALIDO" };
      const instante = agora();

      return acesso().emTransacao(async (tx) => {
        const [desafio] = await tx.$queryRaw<LinhaDoDesafio[]>`
          SELECT * FROM app.auth_desafio_para_conferir(${desafioId}::uuid)`;
        if (desafio === undefined || desafio.consumido_em !== null) {
          return { status: "INVALIDO" };
        }
        if (desafio.expira_em.getTime() <= instante.getTime()) {
          return { status: "EXPIRADO" };
        }

        let passo: number | null = null;
        let aceito = false;
        if (desafio.canal === "EMAIL") {
          aceito =
            desafio.resumo !== null &&
            SEIS_DIGITOS.test(codigo) &&
            (await senhaConfere(codigo, desafio.resumo));
        } else if (
          desafio.credencial_id !== null &&
          desafio.segredo_cifrado !== null
        ) {
          passo = await passoQueConfere({
            cifrador: dependencias.cifrador,
            credencialId: desafio.credencial_id,
            segredoCifrado: desafio.segredo_cifrado,
            codigo,
            agora: instante,
            ultimoPasso: numeroOuNulo(desafio.ultimo_passo),
          });
          aceito = passo !== null;
        }

        const [desfecho] = await tx.$queryRaw<
          { status: string; tentativas_restantes: number }[]
        >`
          SELECT * FROM app.auth_registrar_conferencia_do_desafio(
                          ${desafioId}::uuid, ${aceito}::boolean,
                          ${passo}::bigint, ${TENTATIVAS_DO_DESAFIO}::integer,
                          ${instante}::timestamptz)`;

        switch (desfecho?.status) {
          case "ACEITO":
            return { status: "ACEITO", identidadeId: desafio.identidade_id };
          case "CODIGO_INCORRETO":
            return {
              status: "CODIGO_INCORRETO",
              tentativasRestantes: desfecho.tentativas_restantes,
            };
          case "BLOQUEADO":
            return { status: "BLOQUEADO" };
          default:
            return { status: "INVALIDO" };
        }
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Aplicativo autenticador (AC-121, AC-124, AC-130)
// ---------------------------------------------------------------------------

async function conferirNoLogin(
  tx: TransacaoDoBanco,
  {
    cifrador,
    identidadeId,
    codigo,
    agora,
  }: {
    readonly cifrador: CifradorDeSegredos;
    readonly identidadeId: string;
    readonly codigo: string;
    readonly agora: Date;
  },
): Promise<boolean> {
  const [credencial] = await tx.$queryRaw<
    {
      credencial_id: string;
      segredo_cifrado: string;
      ultimo_passo: bigint | number | null;
    }[]
  >`SELECT * FROM app.auth_totp_para_conferir(${identidadeId}::uuid)`;
  if (credencial === undefined) return false;

  const passo = await passoQueConfere({
    cifrador,
    credencialId: credencial.credencial_id,
    segredoCifrado: credencial.segredo_cifrado,
    codigo,
    agora,
    ultimoPasso: numeroOuNulo(credencial.ultimo_passo),
  });
  if (passo === null) return false;

  const [registro] = await tx.$queryRaw<{ registrado: boolean }[]>`
    SELECT app.auth_totp_registrar_passo(
             ${credencial.credencial_id}::uuid, ${passo}::bigint) AS registrado`;
  return registro?.registrado === true;
}

export function repositorioTotpNoBanco(
  acesso: AcessoDoRepositorio,
  cifrador: CifradorDeSegredos,
): RepositorioTotp {
  return {
    /**
     * Guarda o segredo novo aguardando confirmação. O aplicativo ativo, se
     * houver, continua valendo até o novo ser confirmado (troca de aparelho);
     * um segredo pendente anterior é descartado.
     */
    async guardarPendente(credencial: CredencialTotpCifrada) {
      await acesso().emTransacao(async (tx) => {
        await tx.$executeRaw`
          UPDATE app.totp_credentials
             SET disabled_at = now()
           WHERE identity_id = ${credencial.identidadeId}::uuid
             AND confirmed_at IS NULL
             AND disabled_at IS NULL`;
        await tx.$executeRaw`
          INSERT INTO app.totp_credentials (identity_id, secret_enc)
          VALUES (${credencial.identidadeId}::uuid, ${credencial.segredoCifrado})`;
      });
    },

    /**
     * Confirma o segredo pendente com um código do aplicativo. Ao confirmar,
     * o aplicativo anterior é desativado e o passo usado já fica gasto: o
     * código que ativou não serve para entrar (AC-124).
     */
    async ativarSeCodigoConfere({ identidadeId, codigo, agora }) {
      if (!FORMATO_DE_UUID.test(identidadeId)) return false;
      return acesso().emTransacao(async (tx) => {
        const [pendente] = await tx.$queryRaw<
          { id: string; secret_enc: string }[]
        >`
          SELECT id::text AS id, secret_enc FROM app.totp_credentials
           WHERE identity_id = ${identidadeId}::uuid
             AND confirmed_at IS NULL
             AND disabled_at IS NULL
           FOR UPDATE`;
        if (pendente === undefined) return false;

        const passo = await passoQueConfere({
          cifrador,
          credencialId: pendente.id,
          segredoCifrado: pendente.secret_enc,
          codigo,
          agora,
          ultimoPasso: null,
        });
        if (passo === null) return false;

        await tx.$executeRaw`
          UPDATE app.totp_credentials
             SET disabled_at = ${agora}::timestamptz
           WHERE identity_id = ${identidadeId}::uuid
             AND confirmed_at IS NOT NULL
             AND disabled_at IS NULL`;
        await tx.$executeRaw`
          UPDATE app.totp_credentials
             SET confirmed_at = ${agora}::timestamptz,
                 last_used_step = ${passo}::bigint
           WHERE id = ${pendente.id}::uuid`;
        return true;
      });
    },

    /** O aplicativo ativo; na falta dele, o que aguarda confirmação. */
    async buscar(identidadeId: string) {
      if (!FORMATO_DE_UUID.test(identidadeId)) return null;
      const [linha] = await acesso().emTransacao(
        (tx) =>
          tx.$queryRaw<{ secret_enc: string; ativo: boolean }[]>`
          SELECT secret_enc, confirmed_at IS NOT NULL AS ativo
            FROM app.totp_credentials
           WHERE identity_id = ${identidadeId}::uuid
             AND disabled_at IS NULL
           ORDER BY (confirmed_at IS NOT NULL) DESC
           LIMIT 1`,
      );
      return linha === undefined
        ? null
        : {
            identidadeId,
            segredoCifrado: linha.secret_enc,
            ativo: linha.ativo,
          };
    },

    async validarEConsumir({ identidadeId, codigo, agora }) {
      if (!FORMATO_DE_UUID.test(identidadeId)) return false;
      return acesso().emTransacao((tx) =>
        conferirNoLogin(tx, { cifrador, identidadeId, codigo, agora }),
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Códigos de recuperação (AC-123)
// ---------------------------------------------------------------------------

export function repositorioDeCodigosDeRecuperacaoNoBanco(
  acesso: AcessoDoRepositorio,
): RepositorioDeCodigosDeRecuperacao {
  return {
    /**
     * Grava um jogo novo e descarta os não usados do jogo anterior: só o
     * último jogo mostrado à pessoa vale.
     */
    async criar(codigos: readonly CodigoDeRecuperacaoPersistido[]) {
      const identidades = new Set(codigos.map((codigo) => codigo.identidadeId));
      if (identidades.size === 0) return;
      if (identidades.size > 1) {
        throw new Error(
          "um jogo de códigos de recuperação é de uma identidade só",
        );
      }
      const [identidadeId] = [...identidades] as [string];
      const resumos = codigos.map((codigo) => codigo.resumo);

      await acesso().emTransacao(async (tx) => {
        await tx.$executeRaw`
          DELETE FROM app.recovery_codes
           WHERE identity_id = ${identidadeId}::uuid AND used_at IS NULL`;
        await tx.$executeRaw`
          INSERT INTO app.recovery_codes (identity_id, code_sha256)
          SELECT ${identidadeId}::uuid, resumo
            FROM unnest(${resumos}::text[]) AS resumo`;
      });
    },

    async consumir({ identidadeId, resumo }) {
      if (!FORMATO_DE_UUID.test(identidadeId)) return false;
      const [linha] = await acesso().emTransacao(
        (tx) =>
          tx.$queryRaw<{ consumido: boolean }[]>`
          SELECT app.auth_consumir_codigo_de_recuperacao(
                   ${identidadeId}::uuid, ${resumo}) AS consumido`,
      );
      return linha?.consumido === true;
    },
  };
}
