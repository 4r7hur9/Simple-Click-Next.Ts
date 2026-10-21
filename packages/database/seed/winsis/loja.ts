/**
 * A loja UniversoKar Distribuidora (card #73): criada uma vez, conferida a
 * cada importação. Idempotente — rodar de novo não duplica nada e não
 * desfaz o que o dono mudou no painel (nome, aparência, horário, categorias
 * renomeadas). O que esta etapa GARANTE a cada vez:
 *
 * - a conta do dono (`dono@universokar.test`, senha das contas de teste);
 * - a loja de autopeças, aprovada e ativa, com o dono vinculado;
 * - o limite de produtos da loja acima do tamanho do catálogo, gravado como a
 *   administração grava (`store_limits` + trilha em `audit_log`);
 * - as categorias do mapa e as especificações de autopeças em cada uma
 *   (Marca, Referência do fabricante, Similares, Código).
 */

import type { ClienteSql } from "../../src/migrate.ts";
import { idDeExemplo } from "../deterministico.ts";
import { garantirConta, SENHA_DOS_DONOS, vincular } from "../demo/contas.ts";
import { gravar, json } from "../demo/escrita.ts";
import { CHECKOUT_PADRAO, entrega } from "../demo/lojas/apoio.ts";
import type { MapaDeCategorias } from "./mapeamento.ts";

/** Id previsível do importador: o mesmo nome dá sempre o mesmo id. */
export const idWinsis = (nome: string): string => idDeExemplo(`winsis:${nome}`);

export const LOJA_UNIVERSOKAR = {
  apelido: "universokar",
  nome: "UniversoKar Distribuidora",
  codigo: "UNIVERSOKAR",
  ramo: "AUTO_PARTS",
  dono: { email: "dono@universokar.test", nome: "Dono UniversoKar", senha: SENHA_DOS_DONOS },
} as const;

/** O limite de produtos que a loja passa a ter (o catálogo tem 10.140). */
export const LIMITE_DE_PRODUTOS = 20_000;

/** As especificações de autopeças que o importador preenche, por categoria. */
export const ESPECIFICACOES = [
  { chave: "marca", rotulo: "Marca", filtravel: true },
  { chave: "referencia", rotulo: "Referência do fabricante", filtravel: false },
  { chave: "similares", rotulo: "Similares", filtravel: false },
  { chave: "codigo", rotulo: "Código", filtravel: false },
] as const;

export type ChaveDaEspecificacao = (typeof ESPECIFICACOES)[number]["chave"];

/** A loja pelo apelido, sem criar nada (a prévia e as outras lojas usam). */
export async function acharLoja(
  cliente: ClienteSql,
  apelido: string,
): Promise<{ readonly id: string; readonly ramo: string; readonly donoId: string | null } | null> {
  const resultado = await cliente.query(
    `SELECT s.id::text AS id, s.vertical_code AS ramo,
            (SELECT m.identity_id::text FROM app.store_members m
              WHERE m.store_id = s.id AND m.role = 'OWNER' AND m.revoked_at IS NULL
              ORDER BY m.created_at LIMIT 1) AS dono
       FROM app.stores s WHERE s.slug = $1 AND s.deleted_at IS NULL`,
    [apelido],
  );
  const linha = resultado.rows[0];
  if (linha === undefined) return null;
  return {
    id: String(linha.id),
    ramo: String(linha.ramo),
    donoId: linha.dono === null ? null : String(linha.dono),
  };
}

/** Cria (se preciso) a UniversoKar com dono, aprovação e limite. */
export async function garantirUniversoKar(
  cliente: ClienteSql,
  agora: Date,
): Promise<{ readonly lojaId: string; readonly donoId: string; readonly criada: boolean; readonly notas: string[] }> {
  const loja = LOJA_UNIVERSOKAR;
  const notas: string[] = [];
  const donoId = await garantirConta(cliente, loja.dono);
  const existente = await acharLoja(cliente, loja.apelido);
  const lojaId = existente?.id ?? idWinsis(`loja:${loja.apelido}`);

  if (existente === null) {
    await gravar(cliente, "stores", {
      id: lojaId,
      code: loja.codigo,
      name: loja.nome,
      slug: loja.apelido,
      status: "ACTIVE",
      vertical_code: loja.ramo,
      vertical_schema_version: 1,
      open_state: "SCHEDULE",
      fulfillment_modes: "{PICKUP}",
      approved_at: agora,
      feed_visible: true,
      // 10 mil peças no feed de uma vez afogariam as outras lojas.
      feed_auto_publish_new: false,
      created_by: donoId,
    });
    notas.push(`Loja criada: ${loja.nome} (/loja/${loja.apelido}).`);
  } else {
    // Aprovada e ativa — sem mexer no que o dono configurou.
    const resultado = await cliente.query(
      `UPDATE app.stores
          SET status = 'ACTIVE', approved_at = coalesce(approved_at, $2)
        WHERE id = $1 AND (status <> 'ACTIVE' OR approved_at IS NULL)`,
      [lojaId, agora],
    );
    if ((resultado.rowCount ?? 0) > 0) notas.push("Loja reativada e marcada como aprovada.");
  }
  await vincular(cliente, lojaId, donoId, "OWNER");

  // Apresentação mínima, só na primeira vez: o resto é do dono, no painel.
  await cliente.query(
    `INSERT INTO app.store_settings (store_id, theme, landing, checkout, delivery)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (store_id) DO NOTHING`,
    [
      lojaId,
      json({ primaria: "#1D3557", fundo: "#FFFFFF", destaque: "#e63946" }),
      json({
        boasVindas: "Autopeças para a linha leve, com o estoque da distribuidora.",
        sobre:
          "A UniversoKar Distribuidora atende oficinas e lojas com peças de suspensão, motor, freios, arrefecimento, elétrica e carroceria das principais marcas.",
        mostrarDestaques: true,
      }),
      json(CHECKOUT_PADRAO),
      json({ ...entrega({ taxa: 0, prazoMinutos: 60 }), retiradaNoLocal: true }),
    ],
  );
  const horarios = await cliente.query(
    "SELECT count(*)::int AS n FROM app.store_hours WHERE store_id = $1",
    [lojaId],
  );
  if (Number(horarios.rows[0]?.n ?? 0) === 0) {
    // Horário comercial provisório (seg–sex 8h–18h, sáb 8h–12h); o dono ajusta.
    for (let dia = 0; dia < 7; dia++) {
      const fechado = dia === 0;
      await gravar(cliente, "store_hours", {
        id: idWinsis(`horario:${loja.apelido}:${dia}`),
        store_id: lojaId,
        weekday: dia,
        opens_at: fechado ? "00:00" : "08:00",
        closes_at: fechado ? "00:00" : dia === 6 ? "12:00" : "18:00",
        is_closed: fechado,
        sort_order: 0,
      });
    }
    notas.push("Horário provisório gravado: seg–sex 8h–18h, sáb 8h–12h.");
  }

  await garantirLimiteDeProdutos(cliente, lojaId, notas);
  return { lojaId, donoId, criada: existente === null, notas };
}

/**
 * O ajuste de limite da loja, como `gravarLimitesDaLoja` (admin) grava: a
 * linha em `store_limits` e o antes/depois na trilha da loja. Só quando o
 * limite atual não comporta o catálogo (rodar de novo não enche a trilha).
 */
async function garantirLimiteDeProdutos(
  cliente: ClienteSql,
  lojaId: string,
  notas: string[],
): Promise<void> {
  const atual = await cliente.query(
    "SELECT limite::int AS limite FROM app.limites_da_loja($1) WHERE recurso = 'produtos'",
    [lojaId],
  );
  if (Number(atual.rows[0]?.limite ?? 0) >= LIMITE_DE_PRODUTOS) return;
  const antes = await cliente.query(
    `SELECT max_staff, max_products, max_categories, max_customers
       FROM app.store_limits WHERE store_id = $1`,
    [lojaId],
  );
  const linha = antes.rows[0];
  const ajustesAntes = {
    staff: linha?.max_staff ?? null,
    produtos: linha?.max_products ?? null,
    categorias: linha?.max_categories ?? null,
    clientes: linha?.max_customers ?? null,
  };
  const ajustesDepois = { ...ajustesAntes, produtos: LIMITE_DE_PRODUTOS };
  const admin = await cliente.query(
    `SELECT identity_id::text AS id FROM app.platform_admins
      WHERE revoked_at IS NULL ORDER BY granted_at LIMIT 1`,
  );
  const adminId = admin.rows[0]?.id === undefined ? null : String(admin.rows[0].id);
  await cliente.query(
    `INSERT INTO app.store_limits (store_id, max_products, updated_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (store_id) DO UPDATE SET
       max_products = excluded.max_products, updated_by = excluded.updated_by`,
    [lojaId, LIMITE_DE_PRODUTOS, adminId],
  );
  await cliente.query(
    `INSERT INTO app.audit_log
       (store_id, actor_id, actor_role, action, entity, entity_id, before_data, after_data)
     VALUES ($1::uuid, $2, 'ADMIN', 'LIMITES_ALTERADOS', 'store_limits', $1::text, $3, $4)`,
    [lojaId, adminId, json(ajustesAntes), json(ajustesDepois)],
  );
  notas.push(`Limite de produtos da loja ajustado para ${LIMITE_DE_PRODUTOS.toLocaleString("pt-BR")}.`);
}

/**
 * As categorias do mapa e as especificações de cada uma. Categoria que já
 * existe com o mesmo apelido fica como está (o dono pode ter renomeado).
 * Com `gravar = false` (prévia), só lê o que existe.
 */
export async function garantirCategorias(
  cliente: ClienteSql,
  lojaId: string,
  mapa: MapaDeCategorias,
  gravarNoBanco: boolean,
): Promise<{
  readonly categorias: Map<string, string>;
  readonly especificacoes: Map<string, Map<ChaveDaEspecificacao, string>>;
  readonly criadas: string[];
}> {
  const existentes = await cliente.query(
    "SELECT id::text AS id, slug FROM app.categories WHERE store_id = $1 AND deleted_at IS NULL",
    [lojaId],
  );
  const porApelido = new Map(existentes.rows.map((l) => [String(l.slug), String(l.id)]));
  const categorias = new Map<string, string>();
  const especificacoes = new Map<string, Map<ChaveDaEspecificacao, string>>();
  const criadas: string[] = [];
  for (const [ordem, categoria] of mapa.categorias.entries()) {
    let categoriaId = porApelido.get(categoria.chave);
    if (categoriaId === undefined) {
      categoriaId = idWinsis(`categoria:${lojaId}:${categoria.chave}`);
      criadas.push(categoria.nome);
      if (gravarNoBanco) {
        await gravar(cliente, "categories", {
          id: categoriaId,
          store_id: lojaId,
          name: categoria.nome,
          slug: categoria.chave,
          description: categoria.descricao,
          is_visible: true,
          sort_order: ordem,
          deleted_at: null,
        });
      }
    }
    categorias.set(categoria.chave, categoriaId);

    const definicoes = await cliente.query(
      `SELECT id::text AS id, key FROM app.attribute_definitions
        WHERE store_id = $1 AND category_id = $2 AND deprecated_at IS NULL`,
      [lojaId, categoriaId],
    );
    const porChave = new Map(definicoes.rows.map((l) => [String(l.key), String(l.id)]));
    const daCategoria = new Map<ChaveDaEspecificacao, string>();
    for (const [posicao, especificacao] of ESPECIFICACOES.entries()) {
      let definicaoId = porChave.get(especificacao.chave);
      if (definicaoId === undefined) {
        definicaoId = idWinsis(`especificacao:${categoriaId}:${especificacao.chave}`);
        if (gravarNoBanco) {
          await gravar(cliente, "attribute_definitions", {
            id: definicaoId,
            store_id: lojaId,
            category_id: categoriaId,
            key: especificacao.chave,
            label: especificacao.rotulo,
            data_type: "TEXT",
            is_required: false,
            is_filterable: especificacao.filtravel,
            sort_order: posicao,
            created_by_owner: false,
          });
        }
      }
      daCategoria.set(especificacao.chave, definicaoId);
    }
    especificacoes.set(categoria.chave, daCategoria);
  }
  return { categorias, especificacoes, criadas };
}
