/**
 * Persistência da administração de lojas.
 *
 * Tudo aqui roda na transação da requisição, aberta pela credencial `sc_admin`
 * (`core/db.ts` → `bancoDaAdministracao`). Este arquivo não cria cliente de
 * banco nem abre conexão: pega a transação em curso (P-004). Rodar estas
 * funções pela credencial das lojas não é um atalho que funciona pela metade —
 * a política nega e o privilégio foi retirado (migrações 0003 e 0032).
 *
 * Toda alteração por identificador confere as linhas afetadas: zero vira "não
 * encontrado", nunca sucesso silencioso (norma do repositório, decisão de
 * 17/08).
 */

import { transacaoAtual, type TransacaoDoBanco } from "../../core/db.ts";
import {
  ErroDeApelidoEmUso,
  type LojaGravada,
  type LojaParaGravar,
  type RepositorioDoCadastro,
} from "./criar-loja.usecase.ts";

// ---------------------------------------------------------------------------
// Erros do banco
// ---------------------------------------------------------------------------

interface ErroEmbrulhadoPeloPrisma {
  readonly message?: string;
  readonly meta?: {
    readonly driverAdapterError?: {
      readonly cause?: {
        readonly code?: unknown;
        readonly constraint?: unknown;
      };
    };
  };
}

/** O código do PostgreSQL dentro do erro embrulhado pelo Prisma. */
export function codigoDoPostgres(erro: unknown): string | undefined {
  const embrulhado = erro as ErroEmbrulhadoPeloPrisma | undefined;
  const doAdaptador = embrulhado?.meta?.driverAdapterError?.cause?.code;
  if (typeof doAdaptador === "string") return doAdaptador;
  const naMensagem = /Code: `([0-9A-Za-z]+)`/.exec(
    String(embrulhado?.message ?? ""),
  );
  return naMensagem?.[1];
}

/** Violação de chave única: o banco perdeu a corrida para outro cadastro. */
function ehChaveRepetida(erro: unknown): boolean {
  return codigoDoPostgres(erro) === "23505";
}

// ---------------------------------------------------------------------------
// Trilha de auditoria
// ---------------------------------------------------------------------------

/** Uma linha da trilha, escrita pela administração. */
export interface AtoDaAdministracao {
  readonly lojaId: string;
  readonly atorId: string;
  readonly acao: string;
  readonly entidade: string;
  readonly entidadeId?: string | null;
  /** Já sem dado pessoal: quem chama redige antes (P-009). */
  readonly antes?: Readonly<Record<string, unknown>> | null;
  readonly depois?: Readonly<Record<string, unknown>> | null;
}

/**
 * Acrescenta à trilha, na MESMA transação do ato: ou os dois ficam, ou nenhum.
 * Ato sem registro é justamente o que a trilha existe para impedir.
 */
export async function registrarNaTrilha(
  ato: AtoDaAdministracao,
  tx: TransacaoDoBanco = transacaoAtual(),
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO app.audit_log
      (store_id, actor_id, actor_role, action, entity, entity_id,
       before_data, after_data)
    VALUES (${ato.lojaId}::uuid, ${ato.atorId}::uuid, 'ADMIN', ${ato.acao},
            ${ato.entidade}, ${ato.entidadeId ?? null},
            ${ato.antes === undefined || ato.antes === null ? null : JSON.stringify(ato.antes)}::jsonb,
            ${ato.depois === undefined || ato.depois === null ? null : JSON.stringify(ato.depois)}::jsonb)`;
}

// ---------------------------------------------------------------------------
// Quem é administrador
// ---------------------------------------------------------------------------

const FORMATO_DE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A identidade é administradora da plataforma AGORA?
 *
 * O token diz "ADMIN", mas o token vale quinze minutos e o poder pode ter sido
 * retirado nesse meio-tempo. A segunda camada é perguntar à tabela que só a
 * credencial de administração enxerga.
 */
export async function administradorAtivo(
  identidadeId: string,
): Promise<boolean> {
  if (!FORMATO_DE_UUID.test(identidadeId)) return false;
  const linhas = await transacaoAtual().$queryRaw<{ ativo: boolean }[]>`
    SELECT true AS ativo
      FROM app.platform_admins
     WHERE identity_id = ${identidadeId}::uuid
       AND revoked_at IS NULL`;
  return linhas.length === 1;
}

// ---------------------------------------------------------------------------
// Tipos de negócio
// ---------------------------------------------------------------------------

export interface TipoDeNegocio {
  readonly codigo: string;
  readonly nome: string;
  readonly controlaEstoque: boolean;
}

export async function listarTiposDeNegocio(): Promise<TipoDeNegocio[]> {
  const linhas = await transacaoAtual().$queryRaw<
    { code: string; label: string; tracks_stock: boolean }[]
  >`SELECT code, label, tracks_stock
      FROM app.vertical_presets
     ORDER BY sort_order, label`;
  return linhas.map((linha) => ({
    codigo: linha.code,
    nome: linha.label,
    controlaEstoque: linha.tracks_stock,
  }));
}

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

/**
 * Apelidos ocupados entre os candidatos.
 *
 * Ocupado é o apelido ATUAL de qualquer loja — inclusive a excluída que ainda
 * está no prazo de retenção, porque ela pode voltar — e o apelido ANTIGO de
 * qualquer loja: entregá-lo a outra loja faria o link que o cliente já tinha
 * abrir a loja errada.
 */
async function apelidosOcupados(
  candidatos: readonly string[],
): Promise<ReadonlySet<string>> {
  if (candidatos.length === 0) return new Set();
  const minusculos = candidatos.map((candidato) => candidato.toLowerCase());
  const linhas = await transacaoAtual().$queryRaw<{ apelido: string }[]>`
    SELECT lower(slug) AS apelido FROM app.stores
     WHERE lower(slug) = ANY(${minusculos}::text[])
    UNION
    SELECT lower(host) AS apelido FROM app.store_domains
     WHERE kind = 'LEGACY_SLUG' AND lower(host) = ANY(${minusculos}::text[])`;
  return new Set(linhas.map((linha) => linha.apelido));
}

async function tipoDeNegocioExiste(codigo: string): Promise<boolean> {
  const linhas = await transacaoAtual().$queryRaw<{ existe: boolean }[]>`
    SELECT true AS existe FROM app.vertical_presets WHERE code = ${codigo}`;
  return linhas.length === 1;
}

/**
 * A identidade do responsável: a que já existe com aquele e-mail, ou uma nova.
 *
 * Quem já tem conta na plataforma (dono de outra loja, cliente que compra por
 * aqui) continua sendo UMA pessoa só — é o desenho da identidade global. O
 * nome e o telefone de uma conta existente não são sobrescritos pelo cadastro
 * da loja: quem manda na própria conta é a pessoa.
 */
async function identidadeDoResponsavel(
  tx: TransacaoDoBanco,
  responsavel: LojaParaGravar["dados"]["responsavel"],
): Promise<string> {
  const linhas = await tx.$queryRaw<{ id: string }[]>`
    WITH existente AS (
      SELECT id FROM app.identities WHERE email_norm = ${responsavel.email}
    ), nova AS (
      INSERT INTO app.identities (email_norm, display_name, phone_e164)
      SELECT ${responsavel.email}, ${responsavel.nome}, ${responsavel.telefone}
       WHERE NOT EXISTS (SELECT 1 FROM existente)
      RETURNING id
    )
    SELECT id::text AS id FROM existente
    UNION ALL
    SELECT id::text AS id FROM nova`;
  const id = linhas[0]?.id;
  if (id === undefined)
    throw new Error("identidade do responsável não gravada");
  return id;
}

async function gravarLoja(loja: LojaParaGravar): Promise<LojaGravada> {
  const tx = transacaoAtual();
  const { dados } = loja;
  const tipoDoDocumento = dados.documento.length === 14 ? "CNPJ" : "CPF";

  let gravada: { id: string; code: string; slug: string; status: string };
  try {
    const linhas = await tx.$queryRaw<
      { id: string; code: string; slug: string; status: string }[]
    >`
      INSERT INTO app.stores
        (code, name, legal_name, doc_number, doc_type, slug, status,
         vertical_code, vertical_schema_version, phone1, email,
         street, number, complement, neighborhood, city, uf, zip, created_by)
      SELECT app.proximo_codigo_de_loja(), ${dados.nome},
             ${dados.razaoSocial ?? null}, ${dados.documento},
             ${tipoDoDocumento}, ${dados.apelido}, 'ACTIVE',
             p.code, p.schema_version, ${dados.responsavel.telefone},
             ${dados.responsavel.email}, ${dados.endereco.logradouro},
             ${dados.endereco.numero}, ${dados.endereco.complemento ?? null},
             ${dados.endereco.bairro}, ${dados.endereco.cidade},
             ${dados.endereco.uf}, ${dados.endereco.cep},
             ${loja.criadaPor}::uuid
        FROM app.vertical_presets p
       WHERE p.code = ${dados.tipoDeNegocio}
      RETURNING id::text AS id, code, slug, status`;
    const primeira = linhas[0];
    if (primeira === undefined) throw new Error("loja não gravada");
    gravada = primeira;
  } catch (erro) {
    if (ehChaveRepetida(erro)) throw new ErroDeApelidoEmUso();
    throw erro;
  }

  // Loja sem linha de configuração é loja pela metade: toda leitura de tema,
  // entrega e pagamento passa por ela.
  await tx.$executeRaw`
    INSERT INTO app.store_settings (store_id) VALUES (${gravada.id}::uuid)`;

  const responsavelId = await identidadeDoResponsavel(tx, dados.responsavel);
  await tx.$executeRaw`
    INSERT INTO app.store_members
      (store_id, identity_id, role, invited_by,
       invite_token_hash, invite_expires_at)
    VALUES (${gravada.id}::uuid, ${responsavelId}::uuid, 'OWNER',
            ${loja.criadaPor}::uuid, ${loja.convite.resumoDoToken},
            ${loja.convite.expiraEm})`;

  // O que entra na trilha é o que identifica a loja, e nada do responsável:
  // documento, e-mail e telefone são dado pessoal (P-009).
  await registrarNaTrilha(
    {
      lojaId: gravada.id,
      atorId: loja.criadaPor,
      acao: "LOJA_CRIADA",
      entidade: "stores",
      entidadeId: gravada.id,
      depois: {
        codigo: gravada.code,
        apelido: gravada.slug,
        tipoDeNegocio: dados.tipoDeNegocio,
        status: gravada.status,
      },
    },
    tx,
  );

  return {
    id: gravada.id,
    codigo: gravada.code,
    apelido: gravada.slug,
    status: gravada.status as LojaGravada["status"],
  };
}

/** O repositório do cadastro, sobre a transação em curso. */
export function repositorioDoCadastro(): RepositorioDoCadastro {
  return { tipoDeNegocioExiste, apelidosOcupados, gravarLoja };
}
