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

import type {
  FichaDaLojaNoContrato,
  LojaNaListaNoContrato,
} from "@simpleclick/contracts";

import {
  exigirUmaLinhaAfetada,
  transacaoAtual,
  type TransacaoDoBanco,
} from "../../core/db.ts";
import {
  ErroDeApelidoEmUso,
  type LojaGravada,
  type LojaParaGravar,
  type RepositorioDoCadastro,
} from "./criar-loja.usecase.ts";
import type {
  CadastroEditavel,
  RepositorioDaEdicao,
} from "./editar-loja.usecase.ts";
import type { BuscaDeLojas } from "./listar-lojas.usecase.ts";
import { registroDaTrilha, type LinhaDaTrilha } from "./trilha.ts";

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
// Lista e busca (AC-206)
// ---------------------------------------------------------------------------

interface LojaDaPagina {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly slug: string;
  readonly status: string;
  readonly city: string | null;
  readonly uf: string | null;
  readonly created_at: Date;
  readonly vertical_code: string;
  readonly vertical_label: string;
}

type LinhaDaLista =
  | (LojaDaPagina & { readonly total: number })
  | { readonly id: null; readonly total: number };

/**
 * As lojas que casam com a busca, na página pedida, e quantas casam ao todo.
 *
 * Nome e código casam por trecho, sem acento e sem maiúscula; o documento
 * casa pelos dígitos, quando a busca tem cara de documento. O total sai da
 * mesma consulta, inclusive quando o deslocamento pede uma página vazia. Uma
 * janela `count(*) OVER ()` não devolve linha alguma nesse caso e perderia o
 * total; a contagem é a linha à esquerda do `LEFT JOIN` com a página.
 */
export async function buscarLojas(busca: BuscaDeLojas): Promise<{
  readonly lojas: readonly LojaNaListaNoContrato[];
  readonly total: number;
}> {
  const trecho = `%${busca.texto}%`;
  const digitos = busca.digitos === "" ? null : `%${busca.digitos}%`;
  const linhas = await transacaoAtual().$queryRaw<LinhaDaLista[]>`
    WITH filtradas AS (
      SELECT s.id::text AS id, s.code, s.name, s.slug, s.status, s.city, s.uf,
             s.created_at, p.code AS vertical_code, p.label AS vertical_label
        FROM app.stores s
        JOIN app.vertical_presets p ON p.code = s.vertical_code
       WHERE CASE WHEN ${busca.situacao}::text IS NULL
                  THEN s.deleted_at IS NULL
                  ELSE s.status = ${busca.situacao}::text END
         AND (${busca.texto} = ''
              OR app.sem_acento(lower(s.name)) LIKE app.sem_acento(${trecho})
              OR lower(s.code) LIKE ${trecho}
              OR (${digitos}::text IS NOT NULL
                  AND s.doc_number LIKE ${digitos}::text))
    ),
    contagem AS (SELECT count(*)::int AS total FROM filtradas),
    pagina AS (
      SELECT * FROM filtradas
       ORDER BY created_at DESC, code DESC
       LIMIT ${busca.limite} OFFSET ${busca.deslocamento}
    )
    SELECT pagina.*, contagem.total
      FROM contagem LEFT JOIN pagina ON true`;

  return {
    lojas: linhas.flatMap((linha) =>
      linha.id === null
        ? []
        : [
            {
              id: linha.id,
              codigo: linha.code,
              nome: linha.name,
              apelido: linha.slug,
              tipoDeNegocio: {
                codigo: linha.vertical_code,
                nome: linha.vertical_label,
              },
              status: linha.status as LojaNaListaNoContrato["status"],
              cidade: linha.city,
              uf: linha.uf,
              criadaEm: linha.created_at.toISOString(),
            },
          ],
    ),
    total: linhas[0]?.total ?? 0,
  };
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

// ---------------------------------------------------------------------------
// Ficha da loja e edição do cadastro (AC-207, AC-118)
// ---------------------------------------------------------------------------

interface LinhaDaFicha {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly legal_name: string | null;
  readonly doc_number: string | null;
  readonly doc_type: string | null;
  readonly slug: string;
  readonly status: string;
  readonly email: string | null;
  readonly phone1: string | null;
  readonly zip: string | null;
  readonly street: string | null;
  readonly number: string | null;
  readonly complement: string | null;
  readonly neighborhood: string | null;
  readonly city: string | null;
  readonly uf: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly vertical_code: string;
  readonly vertical_label: string;
  readonly tracks_stock: boolean;
}

interface LinhaDaTrilhaNoBanco {
  readonly id: string;
  readonly created_at: Date;
  readonly action: string;
  readonly actor_id: string | null;
  readonly display_name: string | null;
  readonly actor_role: string;
  readonly before_data: unknown;
  readonly after_data: unknown;
}

/** Quantos atos a ficha mostra. O histórico inteiro é da tela de auditoria. */
export const ATOS_NA_FICHA = 20;

function linhaParaRegistro(linha: LinhaDaTrilhaNoBanco): LinhaDaTrilha {
  return {
    id: linha.id,
    quando: linha.created_at,
    acao: linha.action,
    atorId: linha.actor_id,
    atorNome: linha.display_name,
    papel: linha.actor_role,
    antes: linha.before_data,
    depois: linha.after_data,
  };
}

/**
 * As últimas alterações da loja, da mais nova para a mais antiga.
 *
 * A consulta da administração (`ADMIN_ACCESS`) fica de fora DAQUI: ela é
 * registrada a cada abertura da ficha, e listá-la na própria ficha empurraria
 * as alterações para fora da tela. Ela aparece no histórico completo.
 */
async function alteracoesDaLoja(
  lojaId: string,
): Promise<LinhaDaTrilhaNoBanco[]> {
  return transacaoAtual().$queryRaw<LinhaDaTrilhaNoBanco[]>`
    SELECT a.id::text AS id, a.created_at, a.action, a.actor_id::text AS actor_id,
           i.display_name, a.actor_role, a.before_data, a.after_data
      FROM app.audit_log a
      LEFT JOIN app.identities i ON i.id = a.actor_id
     WHERE a.store_id = ${lojaId}::uuid
       AND a.action <> 'ADMIN_ACCESS'
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT ${ATOS_NA_FICHA}`;
}

/** A ficha completa da loja, ou `null` quando ela não existe. */
export async function lerFichaDaLoja(
  lojaId: string,
): Promise<FichaDaLojaNoContrato | null> {
  const linhas = await transacaoAtual().$queryRaw<LinhaDaFicha[]>`
    SELECT s.id::text AS id, s.code, s.name, s.legal_name, s.doc_number,
           s.doc_type, s.slug, s.status, s.email, s.phone1, s.zip, s.street,
           s.number, s.complement, s.neighborhood, s.city, s.uf,
           s.created_at, s.updated_at,
           p.code AS vertical_code, p.label AS vertical_label, p.tracks_stock
      FROM app.stores s
      JOIN app.vertical_presets p ON p.code = s.vertical_code
     WHERE s.id = ${lojaId}::uuid`;
  const loja = linhas[0];
  if (loja === undefined) return null;

  const historico = await alteracoesDaLoja(lojaId);
  return {
    id: loja.id,
    codigo: loja.code,
    nome: loja.name,
    razaoSocial: loja.legal_name,
    documento: {
      numero: loja.doc_number,
      tipo:
        loja.doc_type === "CPF" || loja.doc_type === "CNPJ"
          ? loja.doc_type
          : null,
    },
    apelido: loja.slug,
    status: loja.status as FichaDaLojaNoContrato["status"],
    tipoDeNegocio: {
      codigo: loja.vertical_code,
      nome: loja.vertical_label,
      controlaEstoque: loja.tracks_stock,
    },
    contato: { email: loja.email, telefone: loja.phone1 },
    endereco: {
      cep: loja.zip,
      logradouro: loja.street,
      numero: loja.number,
      complemento: loja.complement,
      bairro: loja.neighborhood,
      cidade: loja.city,
      uf: loja.uf,
    },
    criadaEm: loja.created_at.toISOString(),
    atualizadaEm: loja.updated_at.toISOString(),
    historico: historico.map((linha) =>
      registroDaTrilha(linhaParaRegistro(linha)),
    ),
  };
}

/**
 * Registra que a administração consultou dado de uma loja (AC-118): quem,
 * o quê e quando — sem o dado consultado.
 */
export async function registrarConsultaDaAdministracao(consulta: {
  readonly lojaId: string;
  readonly atorId: string;
  readonly entidade: string;
  readonly entidadeId?: string | null;
}): Promise<void> {
  await registrarNaTrilha({
    lojaId: consulta.lojaId,
    atorId: consulta.atorId,
    acao: "ADMIN_ACCESS",
    entidade: consulta.entidade,
    entidadeId: consulta.entidadeId ?? consulta.lojaId,
  });
}

interface LinhaDoCadastro {
  readonly name: string;
  readonly legal_name: string | null;
  readonly doc_number: string | null;
  readonly doc_type: string | null;
  readonly email: string | null;
  readonly phone1: string | null;
  readonly zip: string | null;
  readonly street: string | null;
  readonly number: string | null;
  readonly complement: string | null;
  readonly neighborhood: string | null;
  readonly city: string | null;
  readonly uf: string | null;
}

/**
 * O cadastro atual, TRAVADO até o fim da transação: duas edições ao mesmo
 * tempo não podem calcular a diferença sobre o mesmo "antes".
 */
async function lerParaEditar(lojaId: string): Promise<CadastroEditavel | null> {
  const linhas = await transacaoAtual().$queryRaw<LinhaDoCadastro[]>`
    SELECT name, legal_name, doc_number, doc_type, email, phone1, zip, street,
           number, complement, neighborhood, city, uf
      FROM app.stores
     WHERE id = ${lojaId}::uuid
     FOR UPDATE`;
  const linha = linhas[0];
  if (linha === undefined) return null;
  return {
    nome: linha.name,
    razaoSocial: linha.legal_name,
    documento: linha.doc_number,
    tipoDoDocumento:
      linha.doc_type === "CPF" || linha.doc_type === "CNPJ"
        ? linha.doc_type
        : null,
    email: linha.email,
    telefone: linha.phone1,
    cep: linha.zip,
    logradouro: linha.street,
    numero: linha.number,
    complemento: linha.complement,
    bairro: linha.neighborhood,
    cidade: linha.city,
    uf: linha.uf,
  };
}

async function gravarCadastro(
  lojaId: string,
  cadastro: CadastroEditavel,
): Promise<void> {
  await exigirUmaLinhaAfetada(
    { recurso: "loja", id: lojaId },
    () =>
      transacaoAtual().$executeRaw`
      UPDATE app.stores
         SET name = ${cadastro.nome},
             legal_name = ${cadastro.razaoSocial},
             doc_number = ${cadastro.documento},
             doc_type = ${cadastro.tipoDoDocumento},
             email = ${cadastro.email},
             phone1 = ${cadastro.telefone},
             zip = ${cadastro.cep},
             street = ${cadastro.logradouro},
             number = ${cadastro.numero},
             complement = ${cadastro.complemento},
             neighborhood = ${cadastro.bairro},
             city = ${cadastro.cidade},
             uf = ${cadastro.uf}
       WHERE id = ${lojaId}::uuid`,
  );
}

/** O repositório da edição, sobre a transação em curso. */
export function repositorioDaEdicao(): RepositorioDaEdicao {
  return {
    lerParaEditar,
    gravarCadastro,
    registrar: (ato) =>
      registrarNaTrilha({
        lojaId: ato.lojaId,
        atorId: ato.atorId,
        acao: ato.acao,
        entidade: "stores",
        entidadeId: ato.lojaId,
        antes: ato.antes as Readonly<Record<string, unknown>>,
        depois: ato.depois as Readonly<Record<string, unknown>>,
      }),
  };
}
