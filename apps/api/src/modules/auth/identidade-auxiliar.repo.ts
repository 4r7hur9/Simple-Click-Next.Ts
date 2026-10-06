/**
 * Consultas pequenas que as rotas de identidade precisam e que não cabem nas
 * portas dos casos de uso (T-112).
 *
 * - **A própria conta**: e-mail e nome de quem está no contexto, pela
 *   política "só a própria identidade" (`identities_self_select`). Serve ao
 *   aplicativo autenticador (rótulo no celular) e aos avisos por e-mail.
 * - **O desafio na entrada por código de recuperação** (AC-123): de quem é o
 *   desafio aberto, e o consumo dele, pelas funções dedicadas da migração
 *   0046 — o mesmo caminho do código de seis dígitos.
 *
 * Tudo pela credencial que atende requisição e pelo caminho único até o banco
 * (`core/db.ts`, P-004).
 */
import type { AcessoDoRepositorio } from "./identidade.repo.ts";
import { TENTATIVAS_DO_DESAFIO } from "./segundo-fator.repo.ts";

const FORMATO_DE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O desafio aberto, do jeito que a entrada por recuperação precisa. */
export interface DesafioParaRecuperacao {
  readonly identidadeId: string;
  readonly canal: string;
  /** Último passo do aplicativo já usado (canal do aplicativo), ou `null`. */
  readonly ultimoPasso: number | null;
}

export function repositorioAuxiliarDaIdentidade(acesso: AcessoDoRepositorio) {
  return {
    /**
     * E-mail e nome da pessoa do contexto. `null` fora de contexto de pessoa
     * ou para conta anonimizada.
     */
    async propriaConta(): Promise<{
      readonly email: string;
      readonly nome: string;
    } | null> {
      const [linha] = await acesso().emTransacao(
        (tx) =>
          tx.$queryRaw<{ email: string; nome: string | null }[]>`
          SELECT email_norm AS email, display_name AS nome
            FROM app.identities
           WHERE id = app.current_user_id() AND anonymized_at IS NULL`,
      );
      return linha === undefined
        ? null
        : { email: linha.email, nome: linha.nome ?? "" };
    },

    /**
     * Trava o desafio e diz de quem ele é. `null` quando ele não existe, já
     * foi usado ou passou do prazo — a resposta é a mesma nos três casos.
     */
    async desafioAberto(
      desafioId: string,
      agora: Date,
    ): Promise<DesafioParaRecuperacao | null> {
      if (!FORMATO_DE_UUID.test(desafioId)) return null;
      const [linha] = await acesso().emTransacao(
        (tx) =>
          tx.$queryRaw<
            {
              identidade_id: string;
              canal: string;
              expira_em: Date;
              consumido_em: Date | null;
              ultimo_passo: bigint | number | null;
            }[]
          >`
          SELECT identidade_id, canal, expira_em, consumido_em, ultimo_passo
            FROM app.auth_desafio_para_conferir(${desafioId}::uuid)`,
      );
      if (
        linha === undefined ||
        linha.consumido_em !== null ||
        linha.expira_em.getTime() <= agora.getTime()
      ) {
        return null;
      }
      return {
        identidadeId: linha.identidade_id,
        canal: linha.canal,
        ultimoPasso:
          linha.ultimo_passo === null ? null : Number(linha.ultimo_passo),
      };
    },

    /**
     * Registra o desfecho do desafio. Aceito consome o desafio; recusado
     * conta uma tentativa (a quinta bloqueia, AC-107). No canal do aplicativo
     * o consumo gasta o passo informado, para o desafio não servir de novo.
     */
    async registrarDesfecho(dados: {
      readonly desafioId: string;
      readonly aceito: boolean;
      readonly passo: number | null;
      readonly agora: Date;
    }): Promise<string> {
      const [linha] = await acesso().emTransacao(
        (tx) =>
          tx.$queryRaw<{ status: string }[]>`
          SELECT status FROM app.auth_registrar_conferencia_do_desafio(
                   ${dados.desafioId}::uuid, ${dados.aceito}::boolean,
                   ${dados.passo}::bigint, ${TENTATIVAS_DO_DESAFIO}::integer,
                   ${dados.agora}::timestamptz)`,
      );
      return linha?.status ?? "INVALIDO";
    },
  };
}

export type RepositorioAuxiliarDaIdentidade = ReturnType<
  typeof repositorioAuxiliarDaIdentidade
>;
