/**
 * O manifesto do perfil de simulação e as impressões do que está no banco.
 *
 * `saida/manifesto.json` é o que o k6 (card #131) consome: as 100 lojas, os
 * produtos de cada uma e os códigos dos pedidos. O formato está documentado em
 * `docs/estruturacao/04-simulacao.md`.
 *
 * NADA aqui leva token, e-mail, telefone ou senha: o dono de cada loja entra
 * com `dono@<apelido>.simulacao.test` e a senha de demonstração documentada,
 * então o k6 monta o login sem que o manifesto carregue contato.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ClienteSql } from "../../src/migrate.ts";
import { ATACADO, PEDIDOS_POR_LOJA, type PlanoDoPerfil } from "./perfil.ts";

export const PASTA_DE_SAIDA = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "saida",
);

/** Grava um arquivo em `saida/` (a pasta tem `.gitignore` próprio: nada daqui vai para o git). */
export async function escreverSaida(nome: string, texto: string): Promise<string> {
  await mkdir(PASTA_DE_SAIDA, { recursive: true });
  await writeFile(
    resolve(PASTA_DE_SAIDA, ".gitignore"),
    "# Gerado por `seed:simulacao`: não versionar.\n*\n!.gitignore\n",
  );
  const caminho = resolve(PASTA_DE_SAIDA, nome);
  await writeFile(caminho, texto);
  return caminho;
}

export async function lerSaida(nome: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(resolve(PASTA_DE_SAIDA, nome), "utf8");
}

// ---------------------------------------------------------------------------
// Manifesto
// ---------------------------------------------------------------------------

export interface ProdutoDoManifesto {
  readonly id: string;
  readonly slug: string;
  readonly nome: string;
  /** Preço de vitrine, em centavos (o menor, quando há variantes). */
  readonly precoCents: number;
  readonly categoria: string | null;
  /** Caminho público da imagem principal (`/demo/simulacao/...`). */
  readonly imagem: string | null;
  readonly destaque: boolean;
  readonly noFeed: boolean;
  readonly comVariantes: boolean;
  /** Faixa de atacado, quando o produto tem. */
  readonly atacado: { readonly minimo: number; readonly descontoPercent: number } | null;
}

export interface LojaDoManifesto {
  readonly indice: number;
  readonly codigo: string;
  readonly apelido: string;
  readonly nome: string;
  readonly segmento: string;
  readonly bairro: string;
  readonly modalidades: readonly string[];
  readonly logo: string | null;
  readonly capa: string | null;
  readonly produtos: readonly ProdutoDoManifesto[];
  readonly pedidos: {
    readonly quantidade: number;
    /** Códigos de exibição (`A-1001` a `A-1010`), sem o token. */
    readonly codigos: readonly string[];
  };
}

export interface Manifesto {
  readonly versao: 1;
  readonly perfil: {
    readonly semente: string;
    readonly referencia: string;
    readonly impressao: string;
    readonly banco: string;
    readonly lojas: number;
    readonly pedidosPorLoja: number;
  };
  readonly lojas: readonly LojaDoManifesto[];
}

function agrupar<T extends Record<string, unknown>>(
  linhas: readonly T[],
  coluna: string,
): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  for (const linha of linhas) {
    const chave = String(linha[coluna]);
    const grupo = grupos.get(chave);
    if (grupo === undefined) grupos.set(chave, [linha]);
    else grupo.push(linha);
  }
  return grupos;
}

/** Monta o manifesto lendo o que de fato ficou no banco (por `stores.code`). */
export async function montarManifesto(
  cliente: ClienteSql,
  plano: PlanoDoPerfil,
  parametros: { readonly banco: string; readonly referenciaTexto: string },
): Promise<Manifesto> {
  const lojas = await cliente.query(
    `SELECT s.code, s.slug, s.name, s.vertical_code, s.fulfillment_modes,
            ss.landing ->> 'logo' AS logo, ss.landing ->> 'capa' AS capa
       FROM app.stores s
       LEFT JOIN app.store_settings ss ON ss.store_id = s.id
      WHERE s.code LIKE 'SIM-%'`,
  );
  const produtos = await cliente.query(
    `SELECT s.code, p.id, p.slug, p.name, p.display_price_cents, p.price_min_cents,
            p.is_featured, p.publish_to_feed, p.has_variants, c.slug AS categoria,
            (SELECT i.url FROM app.product_images i
              WHERE i.product_id = p.id AND i.is_primary LIMIT 1) AS imagem,
            (SELECT w.min_quantity FROM app.product_prices w
              WHERE w.product_id = p.id AND w.kind = 'WHOLESALE' AND w.discount_kind IS NOT NULL
              ORDER BY w.min_quantity LIMIT 1) AS atacado_minimo,
            (SELECT w.discount_value FROM app.product_prices w
              WHERE w.product_id = p.id AND w.kind = 'WHOLESALE' AND w.discount_kind = 'PERCENT'
              ORDER BY w.min_quantity LIMIT 1) AS atacado_desconto
       FROM app.products p
       JOIN app.stores s ON s.id = p.store_id
       LEFT JOIN app.product_categories pc ON pc.product_id = p.id AND pc.is_primary
       LEFT JOIN app.categories c ON c.id = pc.category_id
      WHERE s.code LIKE 'SIM-%' AND p.status = 'PUBLISHED' AND p.deleted_at IS NULL
      ORDER BY s.code, p.sort_order, p.id`,
  );
  const pedidos = await cliente.query(
    `SELECT s.code AS loja, o.code AS codigo
       FROM app.orders o JOIN app.stores s ON s.id = o.store_id
      WHERE s.code LIKE 'SIM-%'
      ORDER BY s.code, o.number`,
  );

  const lojaPorCodigo = new Map(lojas.rows.map((l) => [String(l.code), l]));
  const produtosPorLoja = agrupar(produtos.rows, "code");
  const pedidosPorLoja = agrupar(pedidos.rows, "loja");

  return {
    versao: 1,
    perfil: {
      semente: plano.semente,
      referencia: parametros.referenciaTexto,
      impressao: plano.impressao,
      banco: parametros.banco,
      lojas: plano.lojas.length,
      pedidosPorLoja: PEDIDOS_POR_LOJA,
    },
    lojas: plano.lojas.map((planoDaLoja) => {
      const linha = lojaPorCodigo.get(planoDaLoja.codigo);
      if (linha === undefined) {
        throw new Error(`Manifesto: a loja ${planoDaLoja.codigo} não está no banco.`);
      }
      const codigos = (pedidosPorLoja.get(planoDaLoja.codigo) ?? []).map((p) => String(p.codigo));
      return {
        indice: planoDaLoja.indice,
        codigo: planoDaLoja.codigo,
        apelido: String(linha.slug),
        nome: String(linha.name),
        segmento: String(linha.vertical_code),
        bairro: planoDaLoja.bairro,
        modalidades: ((linha.fulfillment_modes as string[] | null) ?? []).map(String),
        logo: linha.logo === null ? null : String(linha.logo),
        capa: linha.capa === null ? null : String(linha.capa),
        produtos: (produtosPorLoja.get(planoDaLoja.codigo) ?? []).map((p) => ({
          id: String(p.id),
          slug: String(p.slug),
          nome: String(p.name),
          precoCents: Number(p.price_min_cents ?? p.display_price_cents),
          categoria: p.categoria === null ? null : String(p.categoria),
          imagem: p.imagem === null ? null : String(p.imagem),
          destaque: p.is_featured === true,
          noFeed: p.publish_to_feed === true,
          comVariantes: p.has_variants === true,
          atacado:
            p.atacado_minimo === null
              ? null
              : {
                  minimo: Number(p.atacado_minimo),
                  descontoPercent: Number(p.atacado_desconto ?? ATACADO.desconto),
                },
        })),
        pedidos: { quantidade: codigos.length, codigos },
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Impressões do banco
// ---------------------------------------------------------------------------

const sha256 = (texto: string): string =>
  createHash("sha256").update(texto).digest("hex");

export interface ImpressoesDoBanco {
  /** SHA-256 dos ids ordenados (lojas, categorias, produtos, clientes, pedidos). */
  readonly ids: string;
  /** SHA-256 do conteúdo estável: preços, itens, totais, datas, status e nomes por id. */
  readonly conteudo: string;
  readonly lojas: number;
  readonly pedidos: number;
}

/**
 * As duas impressões do que a carga deixou. Só colunas estáveis: ficam de fora
 * `updated_at`, `created_at` de upsert, hashes de senha e `feed_posts`.
 */
export async function impressoesDoBanco(cliente: ClienteSql): Promise<ImpressoesDoBanco> {
  const consultas: readonly (readonly [string, string])[] = [
    ["lojas", `SELECT id, code, name, slug, vertical_code, status, neighborhood, approved_at FROM app.stores WHERE code LIKE 'SIM-%' ORDER BY id`],
    ["categorias", `SELECT c.id, c.name, c.slug, c.sort_order FROM app.categories c JOIN app.stores s ON s.id = c.store_id WHERE s.code LIKE 'SIM-%' ORDER BY c.id`],
    ["produtos", `SELECT p.id, p.name, p.slug, p.description, p.status, p.is_featured, p.price_min_cents, p.price_max_cents, p.display_price_cents, p.compare_at_cents FROM app.products p JOIN app.stores s ON s.id = p.store_id WHERE s.code LIKE 'SIM-%' ORDER BY p.id`],
    ["precos", `SELECT pr.id, pr.kind, pr.amount_cents, pr.min_quantity, pr.discount_kind, pr.discount_value FROM app.product_prices pr JOIN app.stores s ON s.id = pr.store_id WHERE s.code LIKE 'SIM-%' ORDER BY pr.id`],
    ["clientes", `SELECT c.id, c.display_name FROM app.store_customers c JOIN app.stores s ON s.id = c.store_id WHERE s.code LIKE 'SIM-%' ORDER BY c.id`],
    ["pedidos", `SELECT o.id, o.number, o.code, o.status, o.fulfillment, o.payment_method, o.subtotal_cents, o.delivery_fee_cents, o.total_cents, o.placed_at, o.completed_at, o.cancelled_at, o.cancel_reason FROM app.orders o JOIN app.stores s ON s.id = o.store_id WHERE s.code LIKE 'SIM-%' ORDER BY o.id`],
    ["itens", `SELECT i.id, i.product_name, i.variant_name, i.quantity, i.unit_price_cents, i.options_total_cents, i.line_total_cents FROM app.order_items i JOIN app.stores s ON s.id = i.store_id WHERE s.code LIKE 'SIM-%' ORDER BY i.id`],
    ["opcoes", `SELECT x.id, x.group_name_snapshot, x.option_name_snapshot, x.price_delta_cents FROM app.order_item_options x JOIN app.stores s ON s.id = x.store_id WHERE s.code LIKE 'SIM-%' ORDER BY x.id`],
    ["historico", `SELECT h.id, h.from_status, h.to_status, h.occurred_at FROM app.order_status_history h JOIN app.stores s ON s.id = h.store_id WHERE s.code LIKE 'SIM-%' ORDER BY h.id`],
  ];
  const ids: string[] = [];
  const conteudo: Record<string, unknown[]> = {};
  let lojas = 0;
  let pedidos = 0;
  for (const [rotulo, sql] of consultas) {
    const r = await cliente.query(sql);
    conteudo[rotulo] = r.rows;
    if (rotulo === "lojas") lojas = r.rows.length;
    if (rotulo === "pedidos") pedidos = r.rows.length;
    if (["lojas", "categorias", "produtos", "clientes", "pedidos"].includes(rotulo)) {
      ids.push(...r.rows.map((linha) => String(linha.id)));
    }
  }
  ids.sort();
  return {
    ids: sha256(ids.join("\n")),
    conteudo: sha256(JSON.stringify(conteudo)),
    lojas,
    pedidos,
  };
}
