/**
 * Persistência das exceções de funcionalidade por loja (T-207, migração 0040).
 *
 * Roda na transação em curso, aberta pela credencial `sc_admin` — a única que
 * escreve em `store_feature_overrides`. A linha da loja é travada na leitura,
 * para duas alterações simultâneas não se cruzarem na trilha.
 */

import { transacaoAtual } from "../../core/db.ts";
import { registrarNaTrilha } from "./lojas.repo.ts";
import type {
  ExcecaoGravada,
  LojaDasFuncionalidades,
  RepositorioDasFuncionalidades,
} from "./funcionalidades.usecase.ts";

async function lerLoja(lojaId: string): Promise<LojaDasFuncionalidades | null> {
  const linhas = await transacaoAtual().$queryRaw<
    { id: string; name: string; deleted_at: Date | null }[]
  >`
    SELECT id::text AS id, name, deleted_at
      FROM app.stores
     WHERE id = ${lojaId}::uuid
     FOR UPDATE`;
  const linha = linhas[0];
  if (linha === undefined) return null;
  return {
    id: linha.id,
    nome: linha.name,
    excluida: linha.deleted_at !== null,
  };
}

interface LinhaDaExcecao {
  readonly feature_key: string;
  readonly is_enabled: boolean;
  readonly limit_value: bigint | null;
  readonly reason: string;
  readonly set_at: Date;
  readonly set_by: string;
  readonly display_name: string | null;
}

async function lerExcecoes(lojaId: string): Promise<readonly ExcecaoGravada[]> {
  const linhas = await transacaoAtual().$queryRaw<LinhaDaExcecao[]>`
    SELECT o.feature_key, o.is_enabled, o.limit_value, o.reason, o.set_at,
           o.set_by::text AS set_by, i.display_name
      FROM app.store_feature_overrides o
      LEFT JOIN app.identities i ON i.id = o.set_by
     WHERE o.store_id = ${lojaId}::uuid
     ORDER BY o.feature_key`;
  return linhas.map((linha) => ({
    chave: linha.feature_key,
    ligada: linha.is_enabled,
    limite: linha.limit_value === null ? null : Number(linha.limit_value),
    motivo: linha.reason,
    definidaEm: linha.set_at,
    definidaPor: {
      id: linha.set_by,
      nome: linha.display_name ?? "Pessoa sem nome",
    },
  }));
}

/** O repositório das funcionalidades, sobre a transação em curso. */
export function repositorioDasFuncionalidades(): RepositorioDasFuncionalidades {
  return {
    lerLoja,
    lerExcecoes,
    gravarExcecao: async (excecao) => {
      await transacaoAtual().$executeRaw`
        INSERT INTO app.store_feature_overrides
          (store_id, feature_key, is_enabled, reason, set_by, set_at)
        VALUES (${excecao.lojaId}::uuid, ${excecao.chave}, ${excecao.ligada},
                ${excecao.motivo}, ${excecao.atorId}::uuid, now())
        ON CONFLICT (store_id, feature_key) DO UPDATE
           SET is_enabled = EXCLUDED.is_enabled,
               reason     = EXCLUDED.reason,
               set_by     = EXCLUDED.set_by,
               set_at     = EXCLUDED.set_at`;
    },
    apagarExcecao: async (lojaId, chave) => {
      await transacaoAtual().$executeRaw`
        DELETE FROM app.store_feature_overrides
         WHERE store_id = ${lojaId}::uuid AND feature_key = ${chave}`;
    },
    registrar: (registro) =>
      registrarNaTrilha({
        lojaId: registro.lojaId,
        atorId: registro.atorId,
        acao: registro.acao,
        entidade: "store_feature_overrides",
        entidadeId: registro.lojaId,
        antes: registro.antes,
        depois: registro.depois,
      }),
  };
}
