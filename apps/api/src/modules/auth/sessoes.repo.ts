/**
 * Persistência das sessões: famílias de token de renovação, rotação com
 * detecção de reuso e encerramento (T-111; AC-109, AC-110, AC-112, AC-113,
 * AC-129).
 *
 * Duas portas, de dois casos de uso, moram aqui porque são a mesma tabela:
 * `sessao.usecase.ts` cria e renova; `logout.usecase.ts` encerra.
 *
 * - Criar e renovar acontecem antes de haver identidade no contexto da
 *   requisição (o login acabou de conferir a senha; a renovação só tem o token
 *   na mão), então passam pelas funções dedicadas da migração 0046. A rotação
 *   é UMA função: consumir o atual, criar o sucessor e, no reuso, derrubar a
 *   família acontecem com a linha travada — duas renovações simultâneas com o
 *   mesmo token não ganham duas sessões.
 * - Encerrar a sessão atual e todas acontece com a pessoa logada, pela
 *   política "só a própria identidade": um identificador de sessão alheio não
 *   derruba nada, e o repositório responde "não encontrado" em vez de sucesso
 *   silencioso (norma do repositório).
 */

import {
  ErroDeRecursoNaoEncontrado,
  type TransacaoDoBanco,
} from "../../core/db.ts";
import type { AcessoDoRepositorio } from "./identidade.repo.ts";
import type { RepositorioDeSessoes as PortaDoEncerramento } from "./logout.usecase.ts";
import type {
  ClienteDaSessao,
  PedidoDeRotacao,
  RepositorioDeSessoes as PortaDaSessao,
  ResultadoDaRotacaoNoRepositorio,
  SessaoPersistida,
} from "./sessao.usecase.ts";
import type { PapelDaSessao } from "./token.ts";

const FORMATO_DE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLIENTE_NO_BANCO: Readonly<Record<ClienteDaSessao, string>> = {
  navegador: "WEB",
  nativo: "NATIVE",
};

function clienteDoBanco(valor: string | null): ClienteDaSessao {
  if (valor === "WEB") return "navegador";
  if (valor === "NATIVE") return "nativo";
  throw new Error(`tipo de cliente desconhecido vindo do banco: ${valor}`);
}

function papelDoBanco(valor: string | null): PapelDaSessao {
  if (valor === "CUSTOMER" || valor === "OWNER" || valor === "ADMIN") {
    return valor;
  }
  throw new Error(`papel de sessão desconhecido vindo do banco: ${valor}`);
}

interface LinhaDaRotacao {
  readonly estado: string;
  readonly identidade_id: string | null;
  readonly familia_id: string | null;
  readonly papel: string | null;
  readonly cliente: string | null;
  readonly anterior_id: string | null;
  readonly anterior_emitida_em: Date | null;
  readonly anterior_expira_em: Date | null;
  readonly nova_emitida_em: Date | null;
  readonly nova_expira_em: Date | null;
  readonly familia_ja_revogada: boolean | null;
}

function exigir<T>(valor: T | null, campo: string): T {
  if (valor === null) {
    throw new Error(`a rotação devolveu ${campo} vazio`);
  }
  return valor;
}

/** Repositório das sessões: as duas portas, mais o encerramento pelo token. */
export interface RepositorioDeSessoesNoBanco
  extends PortaDaSessao, PortaDoEncerramento {
  /**
   * Encerra a família do token de renovação apresentado — a saída de quem só
   * tem o cookie na mão, com o token de acesso já vencido. Devolve `false`
   * quando o token não é de sessão nenhuma.
   */
  encerrarPeloToken(resumoDoRefresh: string, agora: Date): Promise<boolean>;
}

export function repositorioDeSessoesNoBanco(
  acesso: AcessoDoRepositorio,
): RepositorioDeSessoesNoBanco {
  return {
    async criar(sessao: SessaoPersistida): Promise<void> {
      await acesso().emTransacao(
        (tx) =>
          tx.$executeRaw`
          SELECT app.auth_criar_sessao(
                   ${sessao.id}::uuid, ${sessao.familiaId}::uuid,
                   ${sessao.identidadeId}::uuid, ${sessao.papel},
                   ${CLIENTE_NO_BANCO[sessao.cliente]}, ${sessao.resumoDoRefresh},
                   ${sessao.criadaEm}::timestamptz, ${sessao.expiraEm}::timestamptz)`,
      );
    },

    async rotacionar(
      resumoDoRefreshApresentado: string,
      pedido: PedidoDeRotacao,
      agora: Date,
    ): Promise<ResultadoDaRotacaoNoRepositorio> {
      const [linha] = await acesso().emTransacao(
        (tx) =>
          tx.$queryRaw<LinhaDaRotacao[]>`
          SELECT * FROM app.auth_rotacionar_sessao(
                          ${resumoDoRefreshApresentado}, ${pedido.sessaoId}::uuid,
                          ${pedido.resumoDoNovoRefresh},
                          ${pedido.criadaEm}::timestamptz,
                          ${pedido.expiraEm}::timestamptz, ${agora}::timestamptz)`,
      );

      if (linha?.estado === "reuso_detectado") {
        return {
          estado: "reuso_detectado",
          identidadeId: exigir(linha.identidade_id, "a identidade"),
          familiaId: exigir(linha.familia_id, "a família"),
          familiaJaEstavaRevogada: linha.familia_ja_revogada === true,
        };
      }
      if (linha?.estado !== "rotacionada") return { estado: "recusada" };

      const comum = {
        familiaId: exigir(linha.familia_id, "a família"),
        identidadeId: exigir(linha.identidade_id, "a identidade"),
        papel: papelDoBanco(linha.papel),
        cliente: clienteDoBanco(linha.cliente),
      };
      return {
        estado: "rotacionada",
        anterior: {
          ...comum,
          id: exigir(linha.anterior_id, "a sessão anterior"),
          resumoDoRefresh: resumoDoRefreshApresentado,
          criadaEm: exigir(linha.anterior_emitida_em, "a emissão anterior"),
          expiraEm: exigir(linha.anterior_expira_em, "o prazo anterior"),
        },
        substituta: {
          ...comum,
          id: pedido.sessaoId,
          resumoDoRefresh: pedido.resumoDoNovoRefresh,
          criadaEm: exigir(linha.nova_emitida_em, "a emissão nova"),
          expiraEm: exigir(linha.nova_expira_em, "o prazo novo"),
        },
      };
    },

    async revogarSessao(idDaSessao: string): Promise<void> {
      const alvo = { recurso: "sessão", id: idDaSessao };
      if (!FORMATO_DE_UUID.test(idDaSessao)) {
        throw new ErroDeRecursoNaoEncontrado(alvo);
      }
      await acesso().emTransacao(async (tx) => {
        // Sessão de outra pessoa não aparece aqui (política), e por isso vira
        // "não encontrado". Sessão própria já encerrada continua aparecendo:
        // sair duas vezes não é erro.
        const [sessao] = await tx.$queryRaw<{ familia: string }[]>`
          SELECT family_id::text AS familia FROM app.sessions
           WHERE id = ${idDaSessao}::uuid`;
        if (sessao === undefined) throw new ErroDeRecursoNaoEncontrado(alvo);
        await encerrarFamilia(tx, sessao.familia, "LOGOUT");
      });
    },

    async revogarSessoesDaIdentidade(idDaIdentidade: string): Promise<void> {
      const alvo = { recurso: "identidade", id: idDaIdentidade };
      if (!FORMATO_DE_UUID.test(idDaIdentidade)) {
        throw new ErroDeRecursoNaoEncontrado(alvo);
      }
      await acesso().emTransacao(async (tx) => {
        const [quem] = await tx.$queryRaw<{ propria: boolean | null }[]>`
          SELECT app.current_user_id() = ${idDaIdentidade}::uuid AS propria`;
        if (quem?.propria !== true) throw new ErroDeRecursoNaoEncontrado(alvo);
        await tx.$executeRaw`
          UPDATE app.sessions
             SET revoked_at = now(), revoked_reason = 'LOGOUT_ALL'
           WHERE identity_id = ${idDaIdentidade}::uuid
             AND revoked_at IS NULL`;
      });
    },

    async encerrarPeloToken(resumoDoRefresh: string, agora: Date) {
      const [linha] = await acesso().emTransacao(
        (tx) =>
          tx.$queryRaw<{ encerrada: boolean }[]>`
          SELECT app.auth_encerrar_pelo_token(
                   ${resumoDoRefresh}, ${agora}::timestamptz) AS encerrada`,
      );
      return linha?.encerrada === true;
    },
  };
}

/** Derruba todas as sessões ainda vivas da família — o aparelho inteiro. */
async function encerrarFamilia(
  tx: TransacaoDoBanco,
  familia: string,
  motivo: "LOGOUT",
): Promise<void> {
  await tx.$executeRaw`
    UPDATE app.sessions
       SET revoked_at = now(), revoked_reason = ${motivo}
     WHERE family_id = ${familia}::uuid
       AND revoked_at IS NULL`;
}
