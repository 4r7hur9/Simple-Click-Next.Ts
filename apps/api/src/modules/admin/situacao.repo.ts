/**
 * Persistência da situação da loja: suspender, reativar, excluir, restaurar e
 * a remoção definitiva (AC-209, AC-210, AC-211).
 *
 * Como o resto do módulo, roda na transação em curso, aberta pela credencial
 * `sc_admin` — a única que altera `stores.status` (a das lojas nem tem o
 * privilégio sobre a coluna, migração 0003). Toda alteração por
 * identificador confere as linhas afetadas.
 */

import type { SituacaoDaLoja } from "@simpleclick/contracts";

import { exigirUmaLinhaAfetada, transacaoAtual } from "../../core/db.ts";
import { ErroDeApelidoTomado } from "./alterar-apelido.usecase.ts";
import {
  codigoDoPostgres,
  registrarNaTrilha,
  suspensaoEmCurso,
} from "./lojas.repo.ts";
import type {
  RepositorioDaRemocao,
  RepositorioDaSituacao,
  SituacaoGravada,
} from "./status-loja.usecase.ts";

// ---------------------------------------------------------------------------
// Suspender, reativar, excluir e restaurar
// ---------------------------------------------------------------------------

interface LinhaDaSituacao {
  readonly status: string;
  readonly name: string;
  readonly deleted_at: Date | null;
  readonly purge_after: Date | null;
}

/** A situação atual, com a linha da loja TRAVADA até o fim da transação. */
async function lerSituacao(lojaId: string): Promise<SituacaoGravada | null> {
  const linhas = await transacaoAtual().$queryRaw<LinhaDaSituacao[]>`
    SELECT status, name, deleted_at, purge_after
      FROM app.stores
     WHERE id = ${lojaId}::uuid
     FOR UPDATE`;
  const linha = linhas[0];
  if (linha === undefined) return null;
  return {
    status: linha.status as SituacaoDaLoja,
    nome: linha.name,
    excluidaEm: linha.deleted_at,
    removerApos: linha.purge_after,
  };
}

/** A situação de antes da exclusão, como o último `LOJA_EXCLUIDA` a guardou. */
async function situacaoAntesDaExclusao(
  lojaId: string,
): Promise<SituacaoDaLoja | null> {
  const linhas = await transacaoAtual().$queryRaw<{ status: string | null }[]>`
    SELECT before_data->>'status' AS status
      FROM app.audit_log
     WHERE store_id = ${lojaId}::uuid
       AND action = 'LOJA_EXCLUIDA'
     ORDER BY created_at DESC, id DESC
     LIMIT 1`;
  return situacaoDaTrilha(linhas[0]?.status ?? null);
}

/**
 * A situação como a trilha a guardou. Os atos anteriores ao card #25 falam a
 * língua antiga (`PENDING`, `SUSPENDED`), e a trilha é imutável: traduz aqui.
 */
export function situacaoDaTrilha(status: string | null): SituacaoDaLoja | null {
  switch (status) {
    case "PENDING":
    case "PENDING_APPROVAL":
      return "PENDING_APPROVAL";
    case "SUSPENDED":
    case "INACTIVE":
      return "INACTIVE";
    case "ACTIVE":
    case "REJECTED":
    case "DELETED":
      return status;
    default:
      return null;
  }
}

/** Troca a situação. A primeira vez em ACTIVE marca quando a loja foi ao ar. */
async function gravarStatus(
  lojaId: string,
  status: Exclude<SituacaoDaLoja, "DELETED">,
): Promise<void> {
  await exigirUmaLinhaAfetada(
    { recurso: "loja", id: lojaId },
    () =>
      transacaoAtual().$executeRaw`
      UPDATE app.stores
         SET status = ${status},
             approved_at = CASE WHEN ${status} = 'ACTIVE'
                                THEN coalesce(approved_at, now())
                                ELSE approved_at END
       WHERE id = ${lojaId}::uuid`,
  );
}

async function gravarExclusao(
  lojaId: string,
  excluidaEm: Date,
  removerApos: Date,
): Promise<void> {
  await exigirUmaLinhaAfetada(
    { recurso: "loja", id: lojaId },
    () =>
      transacaoAtual().$executeRaw`
      UPDATE app.stores
         SET status = 'DELETED',
             deleted_at = ${excluidaEm},
             purge_after = ${removerApos}
       WHERE id = ${lojaId}::uuid`,
  );
}

/**
 * Desfaz a exclusão. O apelido volta a contar na chave única (que só olha a
 * loja não excluída): se outra loja o ocupou nesse meio-tempo, o banco recusa
 * e a restauração inteira é desfeita.
 */
async function gravarRestauracao(
  lojaId: string,
  status: Exclude<SituacaoDaLoja, "DELETED">,
): Promise<void> {
  try {
    await exigirUmaLinhaAfetada(
      { recurso: "loja", id: lojaId },
      () =>
        transacaoAtual().$executeRaw`
        UPDATE app.stores
           SET status = ${status}, deleted_at = NULL, purge_after = NULL
         WHERE id = ${lojaId}::uuid`,
    );
  } catch (erro) {
    if (codigoDoPostgres(erro) === "23505") throw new ErroDeApelidoTomado();
    throw erro;
  }
}

/** O repositório da situação, sobre a transação em curso. */
export function repositorioDaSituacao(): RepositorioDaSituacao {
  return {
    lerSituacao,
    suspensaoEmCurso,
    situacaoAntesDaExclusao,
    gravarStatus,
    gravarExclusao,
    gravarRestauracao,
    registrar: (registro) =>
      registrarNaTrilha({
        lojaId: registro.lojaId,
        atorId: registro.atorId,
        acao: registro.acao,
        entidade: "stores",
        entidadeId: registro.lojaId,
        antes: registro.antes,
        depois: registro.depois,
      }),
  };
}

// ---------------------------------------------------------------------------
// Remoção definitiva (AC-211; decisão de 03/10/2026)
// ---------------------------------------------------------------------------

/**
 * Documentos que a remoção definitiva apaga: os do responsável (identidade e
 * comprovante de endereço). O contrato assinado fica, como prova da relação
 * com a plataforma.
 */
const DOCUMENTOS_REMOVIDOS = ["ID_DOC", "ADDRESS_PROOF"] as const;

async function lojasVencidas(
  agora: Date,
  limite: number,
): Promise<readonly string[]> {
  const linhas = await transacaoAtual().$queryRaw<{ id: string }[]>`
    SELECT id::text AS id
      FROM app.stores
     WHERE status = 'DELETED'
       AND purge_after IS NOT NULL
       AND purge_after <= ${agora}
     ORDER BY purge_after, id
     LIMIT ${limite}`;
  return linhas.map((linha) => linha.id);
}

/**
 * Apaga o que só servia para operar e anonimiza o que identifica pessoas.
 *
 * FICAM, de propósito: os pedidos (guarda fiscal — decisão 9 do modelo de
 * dados), a trilha (imutável, G9), o catálogo (sem dado pessoal; o histórico
 * dos pedidos aponta para ele) e o contrato assinado. A linha da loja fica,
 * porque pedido e trilha a referenciam, mas sem nome, documento, contato nem
 * endereço — e com o apelido liberado.
 *
 * A trava pula a loja que outra rodada já reivindicou (`SKIP LOCKED`), e a
 * condição repete o vencimento: loja restaurada entre a lista e a remoção não
 * é removida.
 */
async function removerEmDefinitivo(
  lojaId: string,
  agora: Date,
): Promise<readonly string[] | null> {
  const tx = transacaoAtual();
  const travada = await tx.$queryRaw<{ code: string }[]>`
    SELECT code
      FROM app.stores
     WHERE id = ${lojaId}::uuid
       AND status = 'DELETED'
       AND purge_after IS NOT NULL
       AND purge_after <= ${agora}
     FOR UPDATE SKIP LOCKED`;
  if (travada.length === 0) return null;

  const documentos = await tx.$queryRaw<{ storage_key: string }[]>`
    DELETE FROM app.store_contracts
     WHERE store_id = ${lojaId}::uuid
       AND kind = ANY(${[...DOCUMENTOS_REMOVIDOS]}::text[])
    RETURNING storage_key`;
  const membros = await tx.$executeRaw`
    DELETE FROM app.store_members WHERE store_id = ${lojaId}::uuid`;
  await tx.$executeRaw`
    UPDATE app.store_settings
       SET theme = '{}'::jsonb, landing = '{}'::jsonb, checkout = '{}'::jsonb,
           delivery = '{}'::jsonb, payment = '{}'::jsonb,
           whatsapp = '{}'::jsonb, printing = '{}'::jsonb, seo = '{}'::jsonb,
           notifications = '{}'::jsonb
     WHERE store_id = ${lojaId}::uuid`;
  await exigirUmaLinhaAfetada(
    { recurso: "loja", id: lojaId },
    () =>
      tx.$executeRaw`
      UPDATE app.stores
         SET name = 'Loja ' || code || ' (removida)',
             slugs_antigos = '{}',
             legal_name = NULL, doc_number = NULL, doc_type = NULL,
             slug = 'removida-' || lower(code),
             whatsapp_e164 = NULL, phone1 = NULL, phone2 = NULL, email = NULL,
             street = NULL, number = NULL, complement = NULL,
             neighborhood = NULL, zip = NULL, lat = NULL, lng = NULL,
             purge_after = NULL
       WHERE id = ${lojaId}::uuid`,
  );

  // Ato sem pessoa: quem remove é a tarefa do sistema, no prazo que a
  // exclusão fixou. A trilha diz o que saiu, em números, e nada do que era.
  await tx.$executeRaw`
    INSERT INTO app.audit_log
      (store_id, actor_id, actor_role, action, entity, entity_id,
       before_data, after_data)
    VALUES (${lojaId}::uuid, NULL, 'SYSTEM', 'LOJA_REMOVIDA', 'stores',
            ${lojaId},
            ${JSON.stringify({ status: "DELETED" })}::jsonb,
            ${JSON.stringify({
              status: "DELETED",
              equipe: membros,
              documentos: documentos.length,
            })}::jsonb)`;

  return documentos.map((documento) => documento.storage_key);
}

/** O repositório da remoção definitiva, sobre a transação em curso. */
export function repositorioDaRemocao(): RepositorioDaRemocao {
  return { lojasVencidas, removerEmDefinitivo };
}
