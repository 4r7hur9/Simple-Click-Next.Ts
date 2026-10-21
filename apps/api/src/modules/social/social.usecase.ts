/**
 * Curtidas e comentários (card #47).
 *
 * O lado PÚBLICO roda sem loja no contexto, como a pessoa da sessão (ou como
 * o público): curtidas e comentários próprios passam pelas políticas da
 * pessoa (migração 0062); o que atravessa lojas — contadores e comentários
 * aprovados — passa pelas funções com lista fechada de campos.
 *
 * O lado da LOJA roda com a loja no contexto e o papel do vínculo (dono ou
 * equipe): as políticas da equipe deixam ler, moderar e apagar só os
 * comentários da loja. Toda moderação vai para a trilha (`audit_log`), sem o
 * texto do comentário — só o identificador e a situação.
 *
 * Tudo roda dentro da transação da requisição (`transacaoAtual`).
 */

import {
  AVISO_DE_COMENTARIO_PENDENTE,
  iniciaisDoAutor,
  type BloqueioDeComentarios,
  type ComentarioDaLoja,
  type ComentarioPublico,
  type ComentariosNoContrato,
  type ConsultaDaModeracao,
  type ConsultaDeComentarios,
  type ContagemDeComentarios,
  type Curtida,
  type SituacaoDoComentario,
} from "@simpleclick/contracts";

import { transacaoAtual } from "../../core/db.ts";
import {
  resumoOuZero,
  socialDasLojas,
  socialDosProdutos,
} from "../../core/resumo-social.ts";

// ---------------------------------------------------------------------------
// O alvo
// ---------------------------------------------------------------------------

/** Onde se curte ou comenta: um produto (da loja) ou a própria loja. */
export interface AlvoSocial {
  readonly lojaId: string;
  /** Nulo: o alvo é a loja. */
  readonly produtoId: string | null;
  /** O apelido, quando o alvo é a loja. */
  readonly apelido?: string;
}

/** O produto publicado de loja ativa, ou `null`. */
export async function alvoDoProduto(
  produtoId: string,
): Promise<AlvoSocial | null> {
  const [linha] = await transacaoAtual().$queryRaw<{ id: string | null }[]>`
    SELECT app.loja_do_produto_publico(${produtoId}::uuid)::text AS id`;
  return linha?.id ? { lojaId: linha.id, produtoId } : null;
}

/** A loja ativa do apelido, ou `null`. */
export async function alvoDaLoja(apelido: string): Promise<AlvoSocial | null> {
  const [linha] = await transacaoAtual().$queryRaw<{ id: string | null }[]>`
    SELECT app.loja_ativa_pelo_apelido(${apelido})::text AS id`;
  return linha?.id
    ? { lojaId: linha.id, produtoId: null, apelido: apelido.toLowerCase() }
    : null;
}

// ---------------------------------------------------------------------------
// Curtir
// ---------------------------------------------------------------------------

/** Curte ou descurte, sem duplicar. Devolve o estado e o total novo. */
export async function marcarCurtida(
  alvo: AlvoSocial,
  curtir: boolean,
): Promise<Curtida> {
  const tx = transacaoAtual();
  if (alvo.produtoId !== null) {
    if (curtir) {
      await tx.$executeRaw`
        INSERT INTO app.product_likes (identity_id, store_id, product_id)
        VALUES (app.current_user_id(), ${alvo.lojaId}::uuid, ${alvo.produtoId}::uuid)
        ON CONFLICT (identity_id, product_id) DO NOTHING`;
    } else {
      await tx.$executeRaw`
        DELETE FROM app.product_likes
         WHERE identity_id = app.current_user_id()
           AND product_id = ${alvo.produtoId}::uuid`;
    }
    const numeros = await socialDosProdutos([alvo.produtoId]);
    const { curtidas, curtiu } = resumoOuZero(numeros, alvo.produtoId);
    return { curtidas, curtiu };
  }

  if (curtir) {
    await tx.$executeRaw`
      INSERT INTO app.store_likes (identity_id, store_id)
      VALUES (app.current_user_id(), ${alvo.lojaId}::uuid)
      ON CONFLICT (identity_id, store_id) DO NOTHING`;
  } else {
    await tx.$executeRaw`
      DELETE FROM app.store_likes
       WHERE identity_id = app.current_user_id()
         AND store_id = ${alvo.lojaId}::uuid`;
  }
  const numeros = await socialDasLojas([alvo.apelido ?? ""]);
  const { curtidas, curtiu } = resumoOuZero(numeros, alvo.apelido ?? "");
  return { curtidas, curtiu };
}

// ---------------------------------------------------------------------------
// Comentários: lado público
// ---------------------------------------------------------------------------

function comentarioPublico(linha: {
  readonly id: string;
  readonly author_name: string;
  readonly body: string;
  readonly created_at: Date;
  readonly status: string;
  readonly is_mine: boolean;
}): ComentarioPublico {
  const situacao = linha.status as SituacaoDoComentario;
  return {
    id: linha.id,
    texto: linha.body,
    autor: {
      nome: linha.author_name,
      iniciais: iniciaisDoAutor(linha.author_name),
    },
    criadoEm: linha.created_at.toISOString(),
    situacao,
    meu: linha.is_mine,
    aviso: situacao === "PENDENTE" ? AVISO_DE_COMENTARIO_PENDENTE : null,
  };
}

/**
 * Os aprovados do alvo, paginados; na página 1, com sessão, os pendentes da
 * própria pessoa vêm antes.
 */
export async function comentariosDoAlvo(
  alvo: AlvoSocial,
  consulta: ConsultaDeComentarios,
  comSessao: boolean,
): Promise<ComentariosNoContrato> {
  const tx = transacaoAtual();
  const aprovados = await tx.$queryRaw<
    {
      id: string;
      author_name: string;
      body: string;
      created_at: Date;
      is_mine: boolean | null;
      total: bigint;
    }[]
  >`
    SELECT id::text AS id, author_name, body, created_at, is_mine, total
      FROM app.comentarios_aprovados(
        ${alvo.lojaId}::uuid, ${alvo.produtoId}::uuid,
        ${consulta.porPagina}::integer,
        ${(consulta.pagina - 1) * consulta.porPagina}::integer)`;

  // Os pendentes da pessoa: pela política do autor, sem função nenhuma.
  const meus = comSessao
    ? await tx.$queryRaw<
        { id: string; author_name: string; body: string; created_at: Date }[]
      >`
        SELECT id::text AS id, author_name, body, created_at
          FROM app.comments
         WHERE identity_id = app.current_user_id()
           AND store_id = ${alvo.lojaId}::uuid
           AND product_id IS NOT DISTINCT FROM ${alvo.produtoId}::uuid
           AND status = 'PENDENTE'
         ORDER BY created_at DESC`
    : [];

  // Página depois do fim não traz linha nenhuma — nem o total.
  const total =
    aprovados[0] !== undefined
      ? Number(aprovados[0].total)
      : consulta.pagina === 1
        ? 0
        : await totalDeAprovados(alvo);

  return {
    comentarios: [
      ...(consulta.pagina === 1
        ? meus.map((linha) =>
            comentarioPublico({ ...linha, status: "PENDENTE", is_mine: true }),
          )
        : []),
      ...aprovados.map((linha) =>
        comentarioPublico({
          ...linha,
          status: "APROVADO",
          is_mine: linha.is_mine === true,
        }),
      ),
    ],
    pagina: consulta.pagina,
    porPagina: consulta.porPagina,
    total,
    meusPendentes: meus.length,
  };
}

/** O total de aprovados quando a página pedida passou do fim. */
async function totalDeAprovados(alvo: AlvoSocial): Promise<number> {
  const [linha] = await transacaoAtual().$queryRaw<{ total: bigint }[]>`
    SELECT total FROM app.comentarios_aprovados(
      ${alvo.lojaId}::uuid, ${alvo.produtoId}::uuid, 1, 0)`;
  return Number(linha?.total ?? 0);
}

/** O que impede a pessoa de comentar: `OK`, `NAO_ENCONTRADO`, `BLOQUEADO`, `LIMITE`. */
export type PodeComentar = "OK" | "NAO_ENCONTRADO" | "BLOQUEADO" | "LIMITE";

/** Cria o comentário da pessoa da sessão, ou diz por que não pode. */
export async function comentar(
  alvo: AlvoSocial,
  texto: string,
): Promise<{ pode: PodeComentar; comentario: ComentarioPublico | null }> {
  const tx = transacaoAtual();
  const [verificacao] = await tx.$queryRaw<{ pode: string }[]>`
    SELECT app.pode_comentar(${alvo.lojaId}::uuid, ${alvo.produtoId}::uuid) AS pode`;
  const pode = (verificacao?.pode ?? "NAO_ENCONTRADO") as PodeComentar;
  if (pode !== "OK") return { pode, comentario: null };

  // Situação, autor e datas são do gatilho; o placeholder do nome é trocado.
  const [linha] = await tx.$queryRaw<
    {
      id: string;
      author_name: string;
      body: string;
      created_at: Date;
      status: string;
    }[]
  >`
    INSERT INTO app.comments (store_id, product_id, identity_id, author_name, body)
    VALUES (${alvo.lojaId}::uuid, ${alvo.produtoId}::uuid, app.current_user_id(), '-', ${texto})
    RETURNING id::text AS id, author_name, body, created_at, status`;
  if (linha === undefined) return { pode: "NAO_ENCONTRADO", comentario: null };
  return { pode, comentario: comentarioPublico({ ...linha, is_mine: true }) };
}

/** Denuncia um comentário aprovado. Falso quando ele não está à vista. */
export async function denunciar(
  comentarioId: string,
  motivo: string | undefined,
): Promise<boolean> {
  const [linha] = await transacaoAtual().$queryRaw<{ ok: boolean }[]>`
    SELECT app.denunciar_comentario(${comentarioId}::uuid, ${motivo ?? null}::text) AS ok`;
  return linha?.ok === true;
}

/** O autor apaga o próprio comentário. Falso quando não é dele (ou não existe). */
export async function apagarMeuComentario(
  comentarioId: string,
): Promise<boolean> {
  const apagados = await transacaoAtual().$executeRaw`
    DELETE FROM app.comments
     WHERE id = ${comentarioId}::uuid AND identity_id = app.current_user_id()`;
  return apagados > 0;
}

// ---------------------------------------------------------------------------
// Comentários: lado da loja
// ---------------------------------------------------------------------------

async function trilha(registro: {
  readonly acao: string;
  readonly entidade: string;
  readonly entidadeId: string | null;
  readonly papel: string;
  readonly antes?: Record<string, unknown> | null;
  readonly depois?: Record<string, unknown> | null;
}): Promise<void> {
  const antes = registro.antes ?? null;
  const depois = registro.depois ?? null;
  await transacaoAtual().$executeRaw`
    INSERT INTO app.audit_log
      (store_id, actor_id, actor_role, action, entity, entity_id,
       before_data, after_data)
    VALUES (app.current_store_id(), app.current_user_id(), ${registro.papel},
            ${registro.acao}, ${registro.entidade}, ${registro.entidadeId},
            ${antes === null ? null : JSON.stringify(antes)}::jsonb,
            ${depois === null ? null : JSON.stringify(depois)}::jsonb)`;
}

interface LinhaDaModeracao {
  readonly id: string;
  readonly body: string;
  readonly status: string;
  readonly product_id: string | null;
  readonly product_name: string | null;
  readonly author_name: string;
  readonly blocked: boolean;
  readonly created_at: Date;
  readonly moderated_at: Date | null;
  readonly rejection_reason: string | null;
  readonly reports: bigint;
  readonly total: bigint;
}

function comentarioDaLoja(linha: LinhaDaModeracao): ComentarioDaLoja {
  return {
    id: linha.id,
    texto: linha.body,
    situacao: linha.status as SituacaoDoComentario,
    alvo: {
      tipo: linha.product_id === null ? "loja" : "produto",
      produtoId: linha.product_id,
      produtoNome: linha.product_name,
    },
    autor: {
      nome: linha.author_name,
      iniciais: iniciaisDoAutor(linha.author_name),
      bloqueado: linha.blocked,
    },
    criadoEm: linha.created_at.toISOString(),
    moderadoEm: linha.moderated_at?.toISOString() ?? null,
    motivoDaRecusa: linha.rejection_reason,
    denuncias: Number(linha.reports),
  };
}

/**
 * Os comentários da loja do contexto. A fila (PENDENTE) vem do mais antigo
 * para o mais novo — quem esperou mais é atendido antes; as outras situações,
 * do mais novo para o mais antigo.
 */
export async function comentariosDaLoja(
  consulta: ConsultaDaModeracao,
): Promise<{ itens: ComentarioDaLoja[]; total: number }> {
  const alvo = consulta.alvo ?? null;
  const fila = consulta.situacao === "PENDENTE";
  const linhas = await transacaoAtual().$queryRaw<LinhaDaModeracao[]>`
    SELECT c.id::text AS id, c.body, c.status, c.product_id::text AS product_id,
           p.name AS product_name, c.author_name,
           EXISTS (SELECT 1 FROM app.comment_blocks b
                    WHERE b.store_id = c.store_id AND b.identity_id = c.identity_id) AS blocked,
           c.created_at, c.moderated_at, c.rejection_reason,
           (SELECT count(*) FROM app.comment_reports r
             WHERE r.store_id = c.store_id AND r.comment_id = c.id) AS reports,
           count(*) OVER () AS total
      FROM app.comments c
      LEFT JOIN app.products p ON p.id = c.product_id AND p.store_id = c.store_id
     WHERE c.store_id = app.current_store_id()
       AND c.status = ${consulta.situacao}
       AND (${alvo}::text IS NULL
            OR (${alvo}::text = 'loja' AND c.product_id IS NULL)
            OR (${alvo}::text = 'produto' AND c.product_id IS NOT NULL))
       AND (${consulta.produto ?? null}::uuid IS NULL OR c.product_id = ${consulta.produto ?? null}::uuid)
       AND (${consulta.denunciados === "true"} = false
            OR EXISTS (SELECT 1 FROM app.comment_reports r
                        WHERE r.store_id = c.store_id AND r.comment_id = c.id))
     ORDER BY CASE WHEN ${fila} THEN c.created_at END ASC,
              c.created_at DESC, c.id
     LIMIT ${consulta.porPagina}::integer
    OFFSET ${(consulta.pagina - 1) * consulta.porPagina}::integer`;
  return {
    itens: linhas.map(comentarioDaLoja),
    total: Number(linhas[0]?.total ?? 0),
  };
}

/** Um comentário da loja do contexto, ou `null`. */
async function umComentarioDaLoja(
  id: string,
): Promise<ComentarioDaLoja | null> {
  const [linha] = await transacaoAtual().$queryRaw<LinhaDaModeracao[]>`
    SELECT c.id::text AS id, c.body, c.status, c.product_id::text AS product_id,
           p.name AS product_name, c.author_name,
           EXISTS (SELECT 1 FROM app.comment_blocks b
                    WHERE b.store_id = c.store_id AND b.identity_id = c.identity_id) AS blocked,
           c.created_at, c.moderated_at, c.rejection_reason,
           (SELECT count(*) FROM app.comment_reports r
             WHERE r.store_id = c.store_id AND r.comment_id = c.id) AS reports,
           1::bigint AS total
      FROM app.comments c
      LEFT JOIN app.products p ON p.id = c.product_id AND p.store_id = c.store_id
     WHERE c.store_id = app.current_store_id() AND c.id = ${id}::uuid`;
  return linha === undefined ? null : comentarioDaLoja(linha);
}

/** A contagem da loja do contexto (o selo do painel). */
export async function contagemDaLoja(): Promise<ContagemDeComentarios> {
  const [linha] = await transacaoAtual().$queryRaw<
    {
      pendentes: bigint;
      aprovados: bigint;
      recusados: bigint;
      denunciados: bigint;
    }[]
  >`
    SELECT count(*) FILTER (WHERE c.status = 'PENDENTE') AS pendentes,
           count(*) FILTER (WHERE c.status = 'APROVADO') AS aprovados,
           count(*) FILTER (WHERE c.status = 'RECUSADO') AS recusados,
           count(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM app.comment_reports r
              WHERE r.store_id = c.store_id AND r.comment_id = c.id)) AS denunciados
      FROM app.comments c
     WHERE c.store_id = app.current_store_id()`;
  return {
    pendentes: Number(linha?.pendentes ?? 0),
    aprovados: Number(linha?.aprovados ?? 0),
    recusados: Number(linha?.recusados ?? 0),
    denunciados: Number(linha?.denunciados ?? 0),
  };
}

/** Aprova ou recusa. `null` quando o comentário não é da loja. */
export async function moderar(
  id: string,
  situacao: "APROVADO" | "RECUSADO",
  motivo: string | null,
  papel: string,
): Promise<ComentarioDaLoja | null> {
  const antes = await umComentarioDaLoja(id);
  if (antes === null) return null;
  const motivoGravado = situacao === "RECUSADO" ? motivo : null;
  if (antes.situacao === situacao && antes.motivoDaRecusa === motivoGravado) {
    return antes;
  }
  await transacaoAtual().$executeRaw`
    UPDATE app.comments
       SET status = ${situacao},
           rejection_reason = ${motivoGravado},
           moderated_by = app.current_user_id(),
           moderated_at = now(),
           updated_at = now()
     WHERE id = ${id}::uuid AND store_id = app.current_store_id()`;
  await trilha({
    acao:
      situacao === "APROVADO" ? "COMENTARIO_APROVADO" : "COMENTARIO_RECUSADO",
    entidade: "comments",
    entidadeId: id,
    papel,
    antes: { situacao: antes.situacao },
    depois: { situacao, comMotivo: motivoGravado !== null },
  });
  return umComentarioDaLoja(id);
}

/** Apaga de vez. Falso quando o comentário não é da loja. */
export async function apagarComentarioDaLoja(
  id: string,
  papel: string,
): Promise<boolean> {
  const antes = await umComentarioDaLoja(id);
  if (antes === null) return false;
  await transacaoAtual().$executeRaw`
    DELETE FROM app.comments WHERE id = ${id}::uuid AND store_id = app.current_store_id()`;
  await trilha({
    acao: "COMENTARIO_APAGADO",
    entidade: "comments",
    entidadeId: id,
    papel,
    antes: { situacao: antes.situacao, denuncias: antes.denuncias },
  });
  return true;
}

interface LinhaDoBloqueio {
  readonly id: string;
  readonly author_name: string;
  readonly reason: string | null;
  readonly created_at: Date;
}

function bloqueio(linha: LinhaDoBloqueio): BloqueioDeComentarios {
  return {
    id: linha.id,
    nome: linha.author_name,
    iniciais: iniciaisDoAutor(linha.author_name),
    motivo: linha.reason,
    desde: linha.created_at.toISOString(),
  };
}

/**
 * Bloqueia o autor do comentário de comentar na loja, e recusa os pendentes
 * dele. Idempotente. `null` quando o comentário não é da loja.
 */
export async function bloquearAutor(
  comentarioId: string,
  motivo: string | null,
  papel: string,
): Promise<BloqueioDeComentarios | null> {
  const tx = transacaoAtual();
  const [linha] = await tx.$queryRaw<LinhaDoBloqueio[]>`
    INSERT INTO app.comment_blocks (store_id, identity_id, author_name, reason, created_by)
    SELECT c.store_id, c.identity_id, c.author_name, ${motivo}, app.current_user_id()
      FROM app.comments c
     WHERE c.id = ${comentarioId}::uuid AND c.store_id = app.current_store_id()
    ON CONFLICT (store_id, identity_id) DO UPDATE
       SET reason = coalesce(excluded.reason, app.comment_blocks.reason)
    RETURNING id::text AS id, author_name, reason, created_at`;
  if (linha === undefined) return null;
  const recusados = await tx.$executeRaw`
    UPDATE app.comments
       SET status = 'RECUSADO', moderated_by = app.current_user_id(),
           moderated_at = now(), updated_at = now()
     WHERE store_id = app.current_store_id()
       AND status = 'PENDENTE'
       AND identity_id = (SELECT identity_id FROM app.comment_blocks
                           WHERE id = ${linha.id}::uuid)`;
  await trilha({
    acao: "COMENTARIOS_AUTOR_BLOQUEADO",
    entidade: "comment_blocks",
    entidadeId: linha.id,
    papel,
    depois: { comentarioId, pendentesRecusados: recusados },
  });
  return bloqueio(linha);
}

export async function bloqueiosDaLoja(): Promise<BloqueioDeComentarios[]> {
  const linhas = await transacaoAtual().$queryRaw<LinhaDoBloqueio[]>`
    SELECT id::text AS id, author_name, reason, created_at
      FROM app.comment_blocks
     WHERE store_id = app.current_store_id()
     ORDER BY created_at DESC`;
  return linhas.map(bloqueio);
}

/** Desbloqueia. Falso quando o bloqueio não é da loja. */
export async function desbloquear(id: string, papel: string): Promise<boolean> {
  const apagados = await transacaoAtual().$executeRaw`
    DELETE FROM app.comment_blocks
     WHERE id = ${id}::uuid AND store_id = app.current_store_id()`;
  if (apagados === 0) return false;
  await trilha({
    acao: "COMENTARIOS_AUTOR_DESBLOQUEADO",
    entidade: "comment_blocks",
    entidadeId: id,
    papel,
  });
  return true;
}

/** A loja aprova os comentários sozinha? */
export async function aprovaAutomaticamente(): Promise<boolean> {
  const [linha] = await transacaoAtual().$queryRaw<{ auto: boolean }[]>`
    SELECT comments_auto_approve AS auto FROM app.stores WHERE id = app.current_store_id()`;
  return linha?.auto ?? false;
}

export async function gravarAprovacaoAutomatica(
  ligada: boolean,
  papel: string,
): Promise<boolean> {
  const antes = await aprovaAutomaticamente();
  if (antes !== ligada) {
    await transacaoAtual().$executeRaw`
      UPDATE app.stores SET comments_auto_approve = ${ligada}
       WHERE id = app.current_store_id()`;
    await trilha({
      acao: "COMENTARIOS_CONFIGURADOS",
      entidade: "stores",
      entidadeId: null,
      papel,
      antes: { aprovarAutomaticamente: antes },
      depois: { aprovarAutomaticamente: ligada },
    });
  }
  return ligada;
}
