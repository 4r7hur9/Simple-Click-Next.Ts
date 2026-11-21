/**
 * Leitura da trilha da PLATAFORMA (`audit_platform`) pela administração
 * (card #170, T-3): atos sobre pessoas, pedidos do titular (LGPD), limites
 * padrão e limites de dono — o que não é de loja nenhuma.
 *
 * Só LÊ: a tabela é append-only (gatilho e privilégios, migração 0051), e só a
 * credencial `sc_admin` enxerga. Uma consulta com parâmetros, OFFSET no
 * servidor e no máximo 100 por página (o contrato recusa mais).
 *
 * DUAS CAMADAS CONTRA DADO PESSOAL (P-009), como no histórico das lojas: quem
 * grava já mascara, e a leitura mascara de novo todo campo cujo nome é de
 * dado pessoal — inclusive a origem técnica (IP e navegador) que o pedido do
 * titular guarda.
 */

import type {
  CampoDaTrilhaNoContrato,
  ConsultaDaAuditoriaDaPlataformaNoContrato,
  PaginaDaAuditoriaDaPlataformaNoContrato,
  RegistroDaTrilhaNoContrato,
} from "@simpleclick/contracts";

import { transacaoAtual } from "../../core/db.ts";
import { camposProtegidos } from "./auditoria.usecase.ts";
import {
  mascararDadoPessoal,
  registroDaTrilha,
  type LinhaDaTrilha,
} from "./trilha.ts";

/** Brasília não tem horário de verão desde 2019: o dia começa às 03:00 UTC. */
const FUSO_DE_BRASILIA = "-03:00";
const UM_DIA_EM_MS = 24 * 60 * 60 * 1000;

/** Origem técnica do pedido: não é nome de campo pessoal, mas identifica. */
const CAMPOS_DE_ORIGEM = /^(ip|useragent|user_agent|agente)$/i;

function inicioDoDia(dia: string): Date {
  return new Date(`${dia}T00:00:00.000${FUSO_DE_BRASILIA}`);
}

function semOrigem(campo: CampoDaTrilhaNoContrato): CampoDaTrilhaNoContrato {
  const ultimo = campo.campo.split(".").at(-1) ?? "";
  if (!CAMPOS_DE_ORIGEM.test(ultimo)) return campo;
  const esconder = (valor: unknown): unknown =>
    typeof valor === "string" && !valor.startsWith("…")
      ? mascararDadoPessoal(valor)
      : valor;
  return {
    campo: campo.campo,
    antes: esconder(campo.antes),
    depois: esconder(campo.depois),
  };
}

/** A linha da trilha da plataforma no formato do contrato, já protegida. */
export function registroProtegidoDaPlataforma(
  linha: LinhaDaTrilha,
): RegistroDaTrilhaNoContrato {
  const registro = registroDaTrilha(linha);
  return {
    ...registro,
    campos: camposProtegidos(registro.campos).map(semOrigem),
  };
}

interface LinhaDaPlataforma {
  readonly id: string | null;
  readonly quando: Date;
  readonly acao: string;
  readonly ator_id: string | null;
  readonly ator_nome: string | null;
  readonly papel: string;
  readonly antes: unknown;
  readonly depois: unknown;
  readonly entidade: string;
  readonly entidade_id: string | null;
  readonly total: number;
}

/** A página pedida da trilha da plataforma, da mais recente para a mais antiga. */
export async function consultarAuditoriaDaPlataforma(
  consulta: ConsultaDaAuditoriaDaPlataformaNoContrato,
): Promise<PaginaDaAuditoriaDaPlataformaNoContrato> {
  const acao = consulta.ato ?? null;
  const desde = consulta.de === undefined ? null : inicioDoDia(consulta.de);
  const antesDe =
    consulta.ate === undefined
      ? null
      : new Date(inicioDoDia(consulta.ate).getTime() + UM_DIA_EM_MS);
  const deslocamento = (consulta.pagina - 1) * consulta.porPagina;

  const linhas = await transacaoAtual().$queryRaw<LinhaDaPlataforma[]>`
    WITH filtradas AS (
      SELECT a.*
        FROM app.audit_platform a
       WHERE (${acao}::text IS NULL OR a.action = ${acao}::text)
         AND (${desde}::timestamptz IS NULL OR a.created_at >= ${desde}::timestamptz)
         AND (${antesDe}::timestamptz IS NULL OR a.created_at < ${antesDe}::timestamptz)
    ),
    total AS (SELECT count(*)::int AS total FROM filtradas),
    pagina AS (
      SELECT f.id::text AS id, f.created_at AS quando, f.action AS acao,
             f.actor_id::text AS ator_id, ator.display_name AS ator_nome,
             f.actor_role AS papel, f.before_data AS antes, f.after_data AS depois,
             f.entity AS entidade, f.entity_id AS entidade_id
        FROM filtradas f
        LEFT JOIN app.identities ator ON ator.id = f.actor_id
       ORDER BY f.created_at DESC, f.id DESC
       LIMIT ${consulta.porPagina} OFFSET ${deslocamento}
    )
    SELECT pagina.*, total.total FROM total LEFT JOIN pagina ON true`;

  const registros = linhas.flatMap((linha) =>
    linha.id === null
      ? []
      : [
          {
            ...registroProtegidoDaPlataforma({
              id: linha.id,
              quando: linha.quando,
              acao: linha.acao,
              atorId: linha.ator_id,
              atorNome: linha.ator_nome,
              papel: linha.papel,
              antes: linha.antes,
              depois: linha.depois,
            }),
            entidade: linha.entidade,
            entidadeId: linha.entidade_id,
          },
        ],
  );
  return {
    registros,
    total: Number(linhas[0]?.total ?? 0),
    pagina: consulta.pagina,
    porPagina: consulta.porPagina,
  };
}
