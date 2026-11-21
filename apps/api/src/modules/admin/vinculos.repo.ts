/**
 * Persistência dos vínculos na administração da plataforma (card #170, T-4).
 *
 * Tudo roda na transação da requisição, aberta pela credencial `sc_admin`
 * (`core/db.ts`): este arquivo não abre conexão. SQL sempre com parâmetros.
 *
 * As travas advisory usam as MESMAS chaves que o banco usa quando a loja cria
 * equipe (`app.medir_limite_da_loja`, 0051) e quando a pessoa abre loja
 * (`app.solicitar_loja`, 0052). `medir_limite_da_loja` exige a loja no
 * contexto, que a administração não tem: a trava é pega aqui com a mesma
 * chave, e o uso vem de `app.limites_da_loja(loja)`, que a administração lê.
 *
 * NADA AQUI ESCREVE EM `platform_admins` nem APAGA vínculo: o grant só é
 * LIDO, para proteger quem o tem, e remover é `revoked_at`.
 */

import type {
  ConsultaDeVinculosNoContrato,
  ItemDeVinculoNoContrato,
  ListaDeVinculosNoContrato,
} from "@simpleclick/contracts";

import { transacaoAtual } from "../../core/db.ts";
import {
  ENTIDADE_DA_LOJA,
  type LojaTravada,
  type PapelDoVinculo,
  type PessoaDoVinculo,
  type RepositorioDeVinculos,
  type Vagas,
  type VinculoTravado,
} from "./vinculos.usecase.ts";

/** Semente da chave dos limites da loja (0051). */
const SEMENTE_DOS_LIMITES_DA_LOJA = 8310049;
/** Semente da chave das lojas do dono (0052). */
const SEMENTE_DAS_LOJAS_DO_DONO = 8310052;

/** O texto da busca vira trecho de LIKE, com os curingas escapados. */
function trechoDaBusca(busca: string | undefined): string {
  const texto = (busca ?? "").trim().toLowerCase();
  return texto.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

interface LinhaDoVinculo {
  readonly loja_id: string | null;
  readonly loja_nome: string;
  readonly loja_apelido: string;
  readonly loja_status: ItemDeVinculoNoContrato["lojaStatus"];
  readonly identidade_id: string;
  readonly pessoa_nome: string | null;
  readonly pessoa_email: string;
  readonly papel: PapelDoVinculo;
  readonly desde: Date;
  readonly total: number;
}

/**
 * Os vínculos ATIVOS (aceitos e não revogados) de lojas não excluídas, de um
 * papel só, paginados no servidor. A busca casa nome e apelido da loja e
 * nome e e-mail da pessoa — é por ela que as fichas abrem esta lista já
 * filtrada (D-5).
 */
export async function listarVinculos(
  consulta: ConsultaDeVinculosNoContrato,
): Promise<ListaDeVinculosNoContrato> {
  const papel: PapelDoVinculo = consulta.tipo === "donos" ? "OWNER" : "STAFF";
  const texto = trechoDaBusca(consulta.busca);
  const trecho = `%${texto}%`;
  const deslocamento = (consulta.pagina - 1) * consulta.porPagina;

  const linhas = await transacaoAtual().$queryRaw<LinhaDoVinculo[]>`
    WITH filtrados AS (
      SELECT s.id AS loja_id, s.name AS loja_nome, s.slug AS loja_apelido,
             s.status AS loja_status, i.id AS identidade_id,
             i.display_name AS pessoa_nome, i.email_norm AS pessoa_email,
             m.role AS papel, m.invite_accepted_at AS desde
        FROM app.store_members m
        JOIN app.stores s ON s.id = m.store_id AND s.deleted_at IS NULL
        JOIN app.identities i ON i.id = m.identity_id AND i.anonymized_at IS NULL
       WHERE m.role = ${papel}
         AND m.revoked_at IS NULL
         AND m.invite_accepted_at IS NOT NULL
         AND (${texto}::text = ''
              OR app.sem_acento(lower(s.name)) LIKE app.sem_acento(${trecho}::text)
              OR lower(s.slug) LIKE ${trecho}::text
              OR app.sem_acento(lower(coalesce(i.display_name, ''))) LIKE app.sem_acento(${trecho}::text)
              OR i.email_norm LIKE ${trecho}::text)
    ),
    total AS (SELECT count(*)::int AS total FROM filtrados),
    pagina AS (
      SELECT * FROM filtrados
       ORDER BY loja_nome, loja_id, pessoa_nome NULLS LAST, identidade_id
       LIMIT ${consulta.porPagina} OFFSET ${deslocamento}
    )
    SELECT pagina.loja_id::text AS loja_id, pagina.loja_nome,
           pagina.loja_apelido, pagina.loja_status,
           pagina.identidade_id::text AS identidade_id, pagina.pessoa_nome,
           pagina.pessoa_email, pagina.papel, pagina.desde, total.total
      FROM total LEFT JOIN pagina ON true
     ORDER BY pagina.loja_nome, pagina.loja_id,
              pagina.pessoa_nome NULLS LAST, pagina.identidade_id`;

  return {
    vinculos: linhas.flatMap((linha) =>
      linha.loja_id === null
        ? []
        : [
            {
              lojaId: linha.loja_id,
              lojaNome: linha.loja_nome,
              lojaApelido: linha.loja_apelido,
              lojaStatus: linha.loja_status,
              identidadeId: linha.identidade_id,
              pessoaNome: linha.pessoa_nome,
              pessoaEmail: linha.pessoa_email,
              papel: linha.papel,
              desde: linha.desde.toISOString(),
            },
          ],
    ),
    total: Number(linhas[0]?.total ?? 0),
    pagina: consulta.pagina,
    porPagina: consulta.porPagina,
  };
}

/** Um vínculo pelo id, no formato da lista (a resposta dos atos). */
export async function lerVinculo(
  vinculoId: string,
): Promise<ItemDeVinculoNoContrato | null> {
  const [linha] = await transacaoAtual().$queryRaw<
    Omit<LinhaDoVinculo, "total">[]
  >`
    SELECT s.id::text AS loja_id, s.name AS loja_nome, s.slug AS loja_apelido,
           s.status AS loja_status, i.id::text AS identidade_id,
           i.display_name AS pessoa_nome, i.email_norm AS pessoa_email,
           m.role AS papel, m.invite_accepted_at AS desde
      FROM app.store_members m
      JOIN app.stores s ON s.id = m.store_id
      JOIN app.identities i ON i.id = m.identity_id
     WHERE m.id = ${vinculoId}::uuid
       AND m.revoked_at IS NULL AND m.invite_accepted_at IS NOT NULL`;
  if (linha === undefined || linha.loja_id === null) return null;
  return {
    lojaId: linha.loja_id,
    lojaNome: linha.loja_nome,
    lojaApelido: linha.loja_apelido,
    lojaStatus: linha.loja_status,
    identidadeId: linha.identidade_id,
    pessoaNome: linha.pessoa_nome,
    pessoaEmail: linha.pessoa_email,
    papel: linha.papel,
    desde: linha.desde.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Atos
// ---------------------------------------------------------------------------

/** O repositório dos atos, sobre a transação em curso. */
export function repositorioDeVinculos(): RepositorioDeVinculos {
  return {
    async travarVagasDeLojas(identidadeId): Promise<Vagas> {
      const tx = transacaoAtual();
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended('lojas-do-dono:' || ${identidadeId}::uuid::text,
                           ${SEMENTE_DAS_LOJAS_DO_DONO}::bigint))`;
      const [vagas] = await tx.$queryRaw<{ limite: number; uso: number }[]>`
        SELECT limite, uso FROM app.limite_de_lojas_do_dono(${identidadeId}::uuid)`;
      return { limite: Number(vagas?.limite ?? 0), uso: Number(vagas?.uso ?? 0) };
    },

    async travarVagasDeEquipe(lojaId): Promise<Vagas> {
      const tx = transacaoAtual();
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${lojaId}::uuid::text || ':staff',
                           ${SEMENTE_DOS_LIMITES_DA_LOJA}::bigint))`;
      const [vagas] = await tx.$queryRaw<{ limite: number; uso: number }[]>`
        SELECT limite, uso FROM app.limites_da_loja(${lojaId}::uuid)
         WHERE recurso = 'staff'`;
      return { limite: Number(vagas?.limite ?? 0), uso: Number(vagas?.uso ?? 0) };
    },

    async travarLoja(lojaId): Promise<LojaTravada | null> {
      const [linha] = await transacaoAtual().$queryRaw<
        { id: string; status: string }[]
      >`
        SELECT id::text AS id, status FROM app.stores
         WHERE id = ${lojaId}::uuid AND deleted_at IS NULL
           FOR UPDATE`;
      return linha ?? null;
    },

    async travarPessoas(identidadeIds) {
      const tx = transacaoAtual();
      const linhas = await tx.$queryRaw<
        { id: string; tem_senha: boolean; desativada: boolean }[]
      >`
        SELECT i.id::text AS id, i.password_hash IS NOT NULL AS tem_senha,
               i.disabled_at IS NOT NULL AS desativada
          FROM app.identities i
         WHERE i.id = ANY(${[...identidadeIds]}::uuid[])
           AND i.anonymized_at IS NULL
         ORDER BY i.id
           FOR UPDATE`;
      // O grant é conferido COM as pessoas já travadas, dentro do ato.
      const protegidas = await tx.$queryRaw<{ id: string }[]>`
        SELECT identity_id::text AS id FROM app.platform_admins
         WHERE identity_id = ANY(${[...identidadeIds]}::uuid[])
           AND revoked_at IS NULL`;
      const comGrant = new Set(protegidas.map((linha) => linha.id));
      const pessoas = new Map<string, PessoaDoVinculo>();
      for (const linha of linhas) {
        pessoas.set(linha.id, {
          id: linha.id,
          temSenha: linha.tem_senha,
          desativada: linha.desativada,
          protegida: comGrant.has(linha.id),
        });
      }
      return pessoas;
    },

    async travarVinculo(lojaId, identidadeId): Promise<VinculoTravado | null> {
      const [linha] = await transacaoAtual().$queryRaw<
        {
          id: string;
          role: PapelDoVinculo;
          revogado: boolean;
          aceito: boolean;
        }[]
      >`
        SELECT id::text AS id, role, revoked_at IS NOT NULL AS revogado,
               invite_accepted_at IS NOT NULL AS aceito
          FROM app.store_members
         WHERE store_id = ${lojaId}::uuid AND identity_id = ${identidadeId}::uuid
           FOR UPDATE`;
      if (linha === undefined) return null;
      return {
        id: linha.id,
        papel: linha.role,
        revogado: linha.revogado,
        aceito: linha.aceito,
      };
    },

    async outrosDonosAtivos(lojaId, identidadeId) {
      // Dono ATIVO = vínculo aceito, não revogado, de conta não desativada.
      const [linha] = await transacaoAtual().$queryRaw<{ total: number }[]>`
        SELECT count(*)::int AS total
          FROM app.store_members m
          JOIN app.identities i ON i.id = m.identity_id
         WHERE m.store_id = ${lojaId}::uuid
           AND m.identity_id <> ${identidadeId}::uuid
           AND m.role = 'OWNER' AND m.revoked_at IS NULL
           AND m.invite_accepted_at IS NOT NULL
           AND i.disabled_at IS NULL AND i.anonymized_at IS NULL`;
      return Number(linha?.total ?? 0);
    },

    async gravarVinculo(dados) {
      const tx = transacaoAtual();
      if (dados.existente !== null) {
        // A mesma linha (há um vínculo por pessoa e loja): muda o papel,
        // volta a valer e fica aceita. Convite pendente deixa de existir, e a
        // conta deixa de ser "gerenciada" pela loja — nenhum dono troca a
        // senha de quem a administração vinculou.
        await tx.$executeRaw`
          UPDATE app.store_members
             SET role = ${dados.papel}, revoked_at = NULL,
                 invite_accepted_at = CASE
                   WHEN revoked_at IS NULL AND invite_accepted_at IS NOT NULL
                     AND role = ${dados.papel}
                   THEN invite_accepted_at
                   ELSE ${dados.agora}::timestamptz END,
                 invite_token_hash = NULL, invite_expires_at = NULL,
                 invited_by = ${dados.administradorId}::uuid,
                 account_managed = false
           WHERE id = ${dados.existente.id}::uuid`;
        return dados.existente.id;
      }
      const [criado] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO app.store_members
          (store_id, identity_id, role, invited_by, invite_accepted_at)
        VALUES (${dados.lojaId}::uuid, ${dados.identidadeId}::uuid,
                ${dados.papel}, ${dados.administradorId}::uuid,
                ${dados.agora}::timestamptz)
        RETURNING id::text AS id`;
      if (criado === undefined) throw new Error("vínculo não gravado");
      return criado.id;
    },

    async revogarVinculo(vinculoId, agora) {
      await transacaoAtual().$executeRaw`
        UPDATE app.store_members SET revoked_at = ${agora}::timestamptz
         WHERE id = ${vinculoId}::uuid AND revoked_at IS NULL`;
    },

    async revogarSessoes(identidadeId, agora) {
      return transacaoAtual().$executeRaw`
        UPDATE app.sessions
           SET revoked_at = ${agora}::timestamptz, revoked_reason = 'ROLE_CHANGED'
         WHERE identity_id = ${identidadeId}::uuid AND revoked_at IS NULL`;
    },

    async registrarNaLoja(ato) {
      const antes = ato.antes === null ? null : JSON.stringify(ato.antes);
      const depois = ato.depois === null ? null : JSON.stringify(ato.depois);
      await transacaoAtual().$executeRaw`
        INSERT INTO app.audit_log
          (store_id, actor_id, actor_role, action, entity, entity_id,
           before_data, after_data)
        VALUES (${ato.lojaId}::uuid, ${ato.administradorId}::uuid, 'ADMIN',
                ${ato.acao}, 'store_members', ${ato.vinculoId},
                ${antes}::jsonb, ${depois}::jsonb)`;
    },

    async registrarNaPlataforma(ato) {
      await transacaoAtual().$executeRaw`
        INSERT INTO app.audit_platform
          (actor_id, actor_role, action, entity, entity_id, before_data, after_data)
        VALUES (${ato.administradorId}::uuid, 'ADMIN', ${ato.acao},
                ${ENTIDADE_DA_LOJA}, ${ato.lojaId}, NULL,
                ${JSON.stringify(ato.depois)}::jsonb)`;
    },
  };
}
