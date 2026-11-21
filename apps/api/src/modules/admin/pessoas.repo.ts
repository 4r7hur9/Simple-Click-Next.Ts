/**
 * Persistência das pessoas na administração da plataforma (card #170, T-3).
 *
 * Tudo roda na transação da requisição, aberta pela credencial `sc_admin`
 * (`core/db.ts`): este arquivo não abre conexão. SQL sempre com parâmetros.
 *
 * MINIMIZAÇÃO (LGPD): a lista devolve nome, e-mail e números — nunca
 * telefone, documento ou endereço —, e a busca é só por nome ou e-mail. A
 * ficha acrescenta o telefone e os pedidos AGREGADOS (quantos, o último, por
 * loja); nenhum item, valor ou endereço de pedido sai daqui.
 *
 * NADA AQUI ESCREVE EM `platform_admins`: o grant só é LIDO, para proteger
 * quem o tem.
 */

import type {
  ConsultaDePessoasNoContrato,
  FichaDaPessoaNoContrato,
  ItemDePessoaNoContrato,
  ListaDePessoasNoContrato,
} from "@simpleclick/contracts";

import { transacaoAtual } from "../../core/db.ts";
import {
  ENTIDADE_DA_PESSOA,
  type AtoDePessoa,
  type LojaSemOutroDono,
  type PessoaTravada,
  type RepositorioDePessoas,
} from "./pessoas.usecase.ts";
import { registroProtegidoDaPlataforma } from "./auditoria-da-plataforma.repo.ts";

/** Quantos atos a ficha mostra, do mais recente para o mais antigo. */
export const ATOS_NA_FICHA_DA_PESSOA = 20;

/**
 * As entidades da trilha da plataforma que falam de uma pessoa: os atos daqui
 * e do titular (`identity`), o uso do link gravado pelo banco (`identities`,
 * migração 0075) e o limite de lojas do dono (`owner_limits`).
 */
const ENTIDADES_DA_PESSOA = [ENTIDADE_DA_PESSOA, "identities", "owner_limits"];

/** O texto da busca vira trecho de LIKE, com os curingas escapados. */
function trechoDaBusca(busca: string | undefined): string {
  const texto = (busca ?? "").trim().toLowerCase();
  return texto.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

interface LinhaDaPessoa {
  readonly id: string | null;
  readonly display_name: string | null;
  readonly email_norm: string;
  readonly created_at: Date;
  readonly disabled_at: Date | null;
  readonly tem_senha: boolean;
  readonly donos: number;
  readonly equipe: number;
  readonly protegida: boolean;
}

function itemDaLinha(
  linha: LinhaDaPessoa & { id: string },
): ItemDePessoaNoContrato {
  return {
    identidadeId: linha.id,
    nome: linha.display_name,
    email: linha.email_norm,
    criadaEm: linha.created_at.toISOString(),
    desativada: linha.disabled_at !== null,
    temSenha: linha.tem_senha,
    donoDeLojas: Number(linha.donos),
    equipeDeLojas: Number(linha.equipe),
    protegida: linha.protegida,
  };
}

/**
 * Todas as pessoas (não anonimizadas), com filtro por tipo, situação e busca,
 * paginadas no servidor. O tipo sai do que a pessoa TEM agora: quem é dona de
 * alguma loja conta como dona; quem só é equipe, como equipe; quem não tem
 * vínculo nem grant, como cliente. A conta protegida (administração) aparece
 * só em "todas". As contagens usam a mesma busca e situação.
 */
export async function listarPessoas(
  consulta: ConsultaDePessoasNoContrato,
): Promise<ListaDePessoasNoContrato> {
  const texto = trechoDaBusca(consulta.busca);
  const trecho = `%${texto}%`;
  const deslocamento = (consulta.pagina - 1) * consulta.porPagina;

  const linhas = await transacaoAtual().$queryRaw<
    (LinhaDaPessoa & {
      total: number;
      c_todas: number;
      c_clientes: number;
      c_donos: number;
      c_equipe: number;
    })[]
  >`
    WITH base AS (
      SELECT i.id, i.display_name, i.email_norm, i.created_at, i.disabled_at,
             i.password_hash IS NOT NULL AS tem_senha,
             coalesce(v.donos, 0) AS donos,
             coalesce(v.equipe, 0) AS equipe,
             EXISTS (SELECT 1 FROM app.platform_admins pa
                      WHERE pa.identity_id = i.id AND pa.revoked_at IS NULL) AS protegida
        FROM app.identities i
        LEFT JOIN LATERAL (
          SELECT count(*) FILTER (WHERE m.role = 'OWNER')::int AS donos,
                 count(*) FILTER (WHERE m.role = 'STAFF')::int AS equipe
            FROM app.store_members m
            JOIN app.stores s ON s.id = m.store_id AND s.deleted_at IS NULL
           WHERE m.identity_id = i.id AND m.revoked_at IS NULL
        ) v ON true
       WHERE i.anonymized_at IS NULL
         AND (${consulta.situacao}::text = 'todas'
              OR (${consulta.situacao}::text = 'ativas' AND i.disabled_at IS NULL)
              OR (${consulta.situacao}::text = 'desativadas' AND i.disabled_at IS NOT NULL))
         AND (${texto}::text = ''
              OR app.sem_acento(lower(coalesce(i.display_name, ''))) LIKE app.sem_acento(${trecho}::text)
              OR i.email_norm LIKE ${trecho}::text)
    ),
    classificada AS (
      SELECT b.*,
             CASE WHEN b.donos > 0 THEN 'donos'
                  WHEN b.equipe > 0 THEN 'equipe'
                  WHEN b.protegida THEN 'administracao'
                  ELSE 'clientes' END AS tipo
        FROM base b
    ),
    contagens AS (
      SELECT count(*)::int AS c_todas,
             count(*) FILTER (WHERE tipo = 'clientes')::int AS c_clientes,
             count(*) FILTER (WHERE tipo = 'donos')::int AS c_donos,
             count(*) FILTER (WHERE tipo = 'equipe')::int AS c_equipe
        FROM classificada
    ),
    filtradas AS (
      SELECT * FROM classificada
       WHERE ${consulta.tipo}::text = 'todas' OR tipo = ${consulta.tipo}::text
    ),
    total AS (SELECT count(*)::int AS total FROM filtradas),
    pagina AS (
      SELECT id::text AS id, display_name, email_norm, created_at, disabled_at,
             tem_senha, donos, equipe, protegida
        FROM filtradas
       ORDER BY created_at DESC, id
       LIMIT ${consulta.porPagina} OFFSET ${deslocamento}
    )
    SELECT pagina.*, total.total, contagens.*
      FROM total CROSS JOIN contagens LEFT JOIN pagina ON true`;

  const primeira = linhas[0];
  return {
    pessoas: linhas.flatMap((linha) =>
      linha.id === null ? [] : [itemDaLinha({ ...linha, id: linha.id })],
    ),
    total: Number(primeira?.total ?? 0),
    pagina: consulta.pagina,
    porPagina: consulta.porPagina,
    contagens: {
      todas: Number(primeira?.c_todas ?? 0),
      clientes: Number(primeira?.c_clientes ?? 0),
      donos: Number(primeira?.c_donos ?? 0),
      equipe: Number(primeira?.c_equipe ?? 0),
    },
  };
}

// ---------------------------------------------------------------------------
// Ficha
// ---------------------------------------------------------------------------

interface LinhaDaFicha extends LinhaDaPessoa {
  readonly phone_e164: string | null;
}

/** A ficha da pessoa; `null` quando não existe ou foi anonimizada. */
export async function lerFichaDaPessoa(
  identidadeId: string,
): Promise<FichaDaPessoaNoContrato | null> {
  const tx = transacaoAtual();
  const [linha] = await tx.$queryRaw<LinhaDaFicha[]>`
    SELECT i.id::text AS id, i.display_name, i.email_norm, i.phone_e164,
           i.created_at, i.disabled_at,
           i.password_hash IS NOT NULL AS tem_senha,
           (SELECT count(*)::int FROM app.store_members m
              JOIN app.stores s ON s.id = m.store_id AND s.deleted_at IS NULL
             WHERE m.identity_id = i.id AND m.revoked_at IS NULL
               AND m.role = 'OWNER') AS donos,
           (SELECT count(*)::int FROM app.store_members m
              JOIN app.stores s ON s.id = m.store_id AND s.deleted_at IS NULL
             WHERE m.identity_id = i.id AND m.revoked_at IS NULL
               AND m.role = 'STAFF') AS equipe,
           EXISTS (SELECT 1 FROM app.platform_admins pa
                    WHERE pa.identity_id = i.id AND pa.revoked_at IS NULL) AS protegida
      FROM app.identities i
     WHERE i.id = ${identidadeId}::uuid AND i.anonymized_at IS NULL`;
  if (linha === undefined || linha.id === null) return null;

  const vinculos = await tx.$queryRaw<
    {
      loja_id: string;
      nome: string;
      apelido: string;
      status: FichaDaPessoaNoContrato["vinculos"][number]["status"];
      papel: "OWNER" | "STAFF";
    }[]
  >`
    SELECT s.id::text AS loja_id, s.name AS nome, s.slug AS apelido,
           s.status, m.role AS papel
      FROM app.store_members m
      JOIN app.stores s ON s.id = m.store_id AND s.deleted_at IS NULL
     WHERE m.identity_id = ${identidadeId}::uuid AND m.revoked_at IS NULL
     ORDER BY (m.role = 'OWNER') DESC, s.name, s.id`;

  // Pedidos como CLIENTE, agregados: a ficha diz quanto e onde, nunca o quê.
  const porLoja = await tx.$queryRaw<
    { loja_id: string; nome: string; total: number; ultimo: Date | null }[]
  >`
    SELECT s.id::text AS loja_id, s.name AS nome,
           count(o.id)::int AS total, max(o.placed_at) AS ultimo
      FROM app.store_customers c
      JOIN app.orders o ON o.store_customer_id = c.id AND o.store_id = c.store_id
      JOIN app.stores s ON s.id = o.store_id
     WHERE c.identity_id = ${identidadeId}::uuid
     GROUP BY s.id, s.name
     ORDER BY count(o.id) DESC, s.name, s.id`;

  const historico = await tx.$queryRaw<
    {
      id: string;
      quando: Date;
      acao: string;
      ator_id: string | null;
      ator_nome: string | null;
      papel: string;
      antes: unknown;
      depois: unknown;
    }[]
  >`
    SELECT a.id::text AS id, a.created_at AS quando, a.action AS acao,
           a.actor_id::text AS ator_id, ator.display_name AS ator_nome,
           a.actor_role AS papel, a.before_data AS antes, a.after_data AS depois
      FROM app.audit_platform a
      LEFT JOIN app.identities ator ON ator.id = a.actor_id
     WHERE a.entity = ANY(${ENTIDADES_DA_PESSOA}::text[])
       AND a.entity_id = ${identidadeId}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT ${ATOS_NA_FICHA_DA_PESSOA}`;

  const ultimo = porLoja.reduce<Date | null>(
    (maior, loja) =>
      loja.ultimo !== null && (maior === null || loja.ultimo > maior)
        ? loja.ultimo
        : maior,
    null,
  );

  return {
    ...itemDaLinha({ ...linha, id: linha.id }),
    telefone: linha.phone_e164,
    desativadaEm: linha.disabled_at?.toISOString() ?? null,
    vinculos: vinculos.map((vinculo) => ({
      lojaId: vinculo.loja_id,
      nome: vinculo.nome,
      apelido: vinculo.apelido,
      status: vinculo.status,
      papel: vinculo.papel,
    })),
    pedidos: {
      total: porLoja.reduce((soma, loja) => soma + Number(loja.total), 0),
      ultimoEm: ultimo?.toISOString() ?? null,
      porLoja: porLoja.map((loja) => ({
        lojaId: loja.loja_id,
        nome: loja.nome,
        total: Number(loja.total),
      })),
    },
    historico: historico.map((ato) =>
      registroProtegidoDaPlataforma({
        id: ato.id,
        quando: ato.quando,
        acao: ato.acao,
        atorId: ato.ator_id,
        atorNome: ato.ator_nome,
        papel: ato.papel,
        antes: ato.antes,
        depois: ato.depois,
      }),
    ),
  };
}

/** A abertura da ficha entra na trilha: quem e quando, sem o que foi lido. */
export async function registrarConsultaDaPessoa(
  identidadeId: string,
  administradorId: string,
): Promise<void> {
  await registrarAtoDePessoa({
    atorId: administradorId,
    acao: "CONTA_CONSULTADA",
    identidadeId,
  });
}

// ---------------------------------------------------------------------------
// Trilha da plataforma
// ---------------------------------------------------------------------------

/** Acrescenta à trilha da plataforma, na MESMA transação do ato. */
export async function registrarAtoDePessoa(ato: AtoDePessoa): Promise<void> {
  const antes =
    ato.antes === undefined || ato.antes === null
      ? null
      : JSON.stringify(ato.antes);
  const depois =
    ato.depois === undefined || ato.depois === null
      ? null
      : JSON.stringify(ato.depois);
  await transacaoAtual().$executeRaw`
    INSERT INTO app.audit_platform
      (actor_id, actor_role, action, entity, entity_id, before_data, after_data)
    VALUES (${ato.atorId}::uuid, 'ADMIN', ${ato.acao}, ${ENTIDADE_DA_PESSOA},
            ${ato.identidadeId}, ${antes}::jsonb, ${depois}::jsonb)`;
}

// ---------------------------------------------------------------------------
// Atos
// ---------------------------------------------------------------------------

/** O repositório dos atos, sobre a transação em curso. */
export function repositorioDePessoas(): RepositorioDePessoas {
  return {
    async travarLojasDoDono(identidadeId) {
      // Em ordem de id: duas transações que travam lojas em comum chegam a
      // elas na mesma sequência e uma espera a outra, sem deadlock.
      await transacaoAtual().$queryRaw`
        SELECT s.id
          FROM app.stores s
         WHERE s.deleted_at IS NULL
           AND s.id IN (SELECT m.store_id FROM app.store_members m
                         WHERE m.identity_id = ${identidadeId}::uuid
                           AND m.role = 'OWNER' AND m.revoked_at IS NULL)
         ORDER BY s.id
           FOR UPDATE OF s`;
    },

    async travarPessoa(identidadeId): Promise<PessoaTravada | null> {
      const tx = transacaoAtual();
      const [linha] = await tx.$queryRaw<
        {
          id: string;
          email_norm: string;
          display_name: string | null;
          phone_e164: string | null;
          tem_senha: boolean;
          disabled_at: Date | null;
        }[]
      >`
        SELECT i.id::text AS id, i.email_norm, i.display_name, i.phone_e164,
               i.password_hash IS NOT NULL AS tem_senha, i.disabled_at
          FROM app.identities i
         WHERE i.id = ${identidadeId}::uuid AND i.anonymized_at IS NULL
           FOR UPDATE`;
      if (linha === undefined) return null;
      // O grant é conferido COM a identidade já travada, dentro do ato.
      const grant = await tx.$queryRaw<{ ativo: boolean }[]>`
        SELECT true AS ativo FROM app.platform_admins
         WHERE identity_id = ${identidadeId}::uuid AND revoked_at IS NULL`;
      return {
        id: linha.id,
        email: linha.email_norm,
        nome: linha.display_name,
        telefone: linha.phone_e164,
        temSenha: linha.tem_senha,
        desativadaEm: linha.disabled_at,
        protegida: grant.length > 0,
      };
    },

    async criarPessoa(dados) {
      // ON CONFLICT em vez de capturar 23505: o erro abortaria a transação, e
      // a recusa ainda precisa ler qual identidade já usa o e-mail.
      const [linha] = await transacaoAtual().$queryRaw<{ id: string }[]>`
        INSERT INTO app.identities (email_norm, display_name, phone_e164)
        VALUES (lower(btrim(${dados.email})), ${dados.nome}, ${dados.telefone})
        ON CONFLICT (email_norm) DO NOTHING
        RETURNING id::text AS id`;
      return linha?.id ?? null;
    },

    async identidadeDoEmail(email) {
      const [linha] = await transacaoAtual().$queryRaw<{ id: string }[]>`
        SELECT id::text AS id FROM app.identities
         WHERE email_norm = lower(btrim(${email}))`;
      return linha?.id ?? null;
    },

    async atualizarPessoa(identidadeId, campos) {
      const tx = transacaoAtual();
      if (campos.nome !== undefined) {
        await tx.$executeRaw`
          UPDATE app.identities SET display_name = ${campos.nome}, updated_at = now()
           WHERE id = ${identidadeId}::uuid`;
      }
      if (campos.telefone !== undefined) {
        await tx.$executeRaw`
          UPDATE app.identities SET phone_e164 = ${campos.telefone}, updated_at = now()
           WHERE id = ${identidadeId}::uuid`;
      }
    },

    async lojasQueFicariamSemDono(identidadeId): Promise<LojaSemOutroDono[]> {
      // Dono ATIVO = vínculo aceito, não revogado, de conta não desativada.
      const linhas = await transacaoAtual().$queryRaw<
        { loja_id: string; nome: string; apelido: string }[]
      >`
        SELECT s.id::text AS loja_id, s.name AS nome, s.slug AS apelido
          FROM app.store_members m
          JOIN app.stores s ON s.id = m.store_id AND s.deleted_at IS NULL
         WHERE m.identity_id = ${identidadeId}::uuid
           AND m.role = 'OWNER' AND m.revoked_at IS NULL
           AND m.invite_accepted_at IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM app.store_members outro
               JOIN app.identities oi ON oi.id = outro.identity_id
              WHERE outro.store_id = s.id
                AND outro.identity_id <> ${identidadeId}::uuid
                AND outro.role = 'OWNER' AND outro.revoked_at IS NULL
                AND outro.invite_accepted_at IS NOT NULL
                AND oi.disabled_at IS NULL AND oi.anonymized_at IS NULL)
         ORDER BY s.name, s.id`;
      return linhas.map((linha) => ({
        lojaId: linha.loja_id,
        nome: linha.nome,
        apelido: linha.apelido,
      }));
    },

    async marcarDesativada(identidadeId, agora) {
      const tx = transacaoAtual();
      await tx.$executeRaw`
        UPDATE app.identities SET disabled_at = ${agora}::timestamptz
         WHERE id = ${identidadeId}::uuid`;
      return tx.$executeRaw`
        UPDATE app.sessions
           SET revoked_at = ${agora}::timestamptz, revoked_reason = 'ACCOUNT_DISABLED'
         WHERE identity_id = ${identidadeId}::uuid AND revoked_at IS NULL`;
    },

    async marcarReativada(identidadeId) {
      await transacaoAtual().$executeRaw`
        UPDATE app.identities SET disabled_at = NULL
         WHERE id = ${identidadeId}::uuid`;
    },

    async consumirAcessosPendentes(identidadeId, agora) {
      const tx = transacaoAtual();
      await tx.$executeRaw`
        UPDATE app.verification_codes
           SET consumed_at = ${agora}::timestamptz
         WHERE identity_id = ${identidadeId}::uuid
           AND purpose = 'PASSWORD_RESET' AND consumed_at IS NULL`;
      // O convite pendente deixa de valer: o aceite confere o prazo.
      await tx.$executeRaw`
        UPDATE app.store_members
           SET invite_expires_at = ${agora}::timestamptz
         WHERE identity_id = ${identidadeId}::uuid
           AND invite_accepted_at IS NULL AND revoked_at IS NULL
           AND invite_token_hash IS NOT NULL
           AND (invite_expires_at IS NULL OR invite_expires_at > ${agora}::timestamptz)`;
    },

    async gravarAcesso(acesso) {
      await transacaoAtual().$executeRaw`
        INSERT INTO app.verification_codes
          (identity_id, purpose, channel, code_hash, expires_at, issued_by)
        VALUES (${acesso.identidadeId}::uuid, 'PASSWORD_RESET', 'EMAIL',
                ${acesso.resumo}, ${acesso.expiraEm}::timestamptz,
                ${acesso.emissorId}::uuid)`;
    },

    registrar: registrarAtoDePessoa,
  };
}
