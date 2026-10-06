/**
 * Leitura do histórico de auditoria da plataforma inteira (T-208, AC-215).
 *
 * Roda na transação da requisição, aberta pela credencial `sc_admin`, que lê
 * a trilha de todas as lojas (política `audit_admin_select`, migração 0006).
 * Só LÊ: a trilha não tem política de alteração nem de remoção, e um gatilho
 * recusa as duas até para a credencial de migração.
 *
 * Os filtros ausentes chegam como nulo e viram "sem esse filtro" no próprio
 * SQL: uma consulta só, com parâmetros, sem montar texto de SQL à mão.
 */

import { transacaoAtual } from "../../core/db.ts";
import type {
  BuscaNaAuditoria,
  LinhaDaAuditoria,
  RepositorioDaAuditoria,
} from "./auditoria.usecase.ts";
import { ATO_DE_CONSULTA } from "./auditoria.usecase.ts";

interface LinhaNoBanco {
  readonly id: string;
  readonly created_at: Date;
  readonly action: string;
  readonly actor_id: string | null;
  readonly display_name: string | null;
  readonly actor_role: string;
  readonly before_data: unknown;
  readonly after_data: unknown;
  readonly loja_id: string;
  readonly loja_codigo: string;
  readonly loja_nome: string;
  readonly total: bigint;
}

/** Uma página da trilha e o total que casa com os filtros. */
export async function buscarNaAuditoria(busca: BuscaNaAuditoria): Promise<{
  readonly linhas: readonly LinhaDaAuditoria[];
  readonly total: number;
}> {
  const tx = transacaoAtual();
  const linhas = await tx.$queryRaw<LinhaNoBanco[]>`
    SELECT a.id::text AS id, a.created_at, a.action,
           a.actor_id::text AS actor_id, i.display_name, a.actor_role,
           a.before_data, a.after_data,
           s.id::text AS loja_id, s.code AS loja_codigo, s.name AS loja_nome,
           count(*) OVER () AS total
      FROM app.audit_log a
      JOIN app.stores s ON s.id = a.store_id
      LEFT JOIN app.identities i ON i.id = a.actor_id
     WHERE (${busca.lojaId}::uuid IS NULL OR a.store_id = ${busca.lojaId}::uuid)
       AND (${busca.acao}::text IS NULL OR a.action = ${busca.acao}::text)
       AND (${busca.desde}::timestamptz IS NULL OR a.created_at >= ${busca.desde}::timestamptz)
       AND (${busca.antesDe}::timestamptz IS NULL OR a.created_at < ${busca.antesDe}::timestamptz)
       AND (NOT ${busca.semConsultas}::boolean OR a.action <> ${ATO_DE_CONSULTA})
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT ${busca.limite} OFFSET ${busca.deslocamento}`;

  const total =
    linhas[0] !== undefined
      ? Number(linhas[0].total)
      : busca.deslocamento > 0
        ? await contarNaAuditoria(busca)
        : 0;

  return {
    linhas: linhas.map((linha) => ({
      id: linha.id,
      quando: linha.created_at,
      acao: linha.action,
      atorId: linha.actor_id,
      atorNome: linha.display_name,
      papel: linha.actor_role,
      antes: linha.before_data,
      depois: linha.after_data,
      loja: {
        id: linha.loja_id,
        codigo: linha.loja_codigo,
        nome: linha.loja_nome,
      },
    })),
    total,
  };
}

/**
 * O total sem a página: só quando a página pedida passou do fim, e por isso
 * não trouxe linha nenhuma de onde ler a contagem.
 */
async function contarNaAuditoria(busca: BuscaNaAuditoria): Promise<number> {
  const [linha] = await transacaoAtual().$queryRaw<{ total: bigint }[]>`
    SELECT count(*) AS total
      FROM app.audit_log a
     WHERE (${busca.lojaId}::uuid IS NULL OR a.store_id = ${busca.lojaId}::uuid)
       AND (${busca.acao}::text IS NULL OR a.action = ${busca.acao}::text)
       AND (${busca.desde}::timestamptz IS NULL OR a.created_at >= ${busca.desde}::timestamptz)
       AND (${busca.antesDe}::timestamptz IS NULL OR a.created_at < ${busca.antesDe}::timestamptz)
       AND (NOT ${busca.semConsultas}::boolean OR a.action <> ${ATO_DE_CONSULTA})`;
  return Number(linha?.total ?? 0);
}

/** O repositório que o caso de uso recebe. */
export function repositorioDaAuditoria(): RepositorioDaAuditoria {
  return { buscarNaAuditoria };
}
