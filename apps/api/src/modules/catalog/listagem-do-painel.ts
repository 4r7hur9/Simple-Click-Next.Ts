/**
 * As listas do catálogo no painel, paginadas no banco (card #76).
 *
 * Loja com dez mil produtos não cabe numa resposta só: a lista de produtos e
 * as páginas Estoque, Variações e Opções pedem UMA página (50 por padrão, até
 * 100), e a busca, os filtros, a ordem, a contagem total e os números do topo
 * saem daqui, calculados pelo PostgreSQL. O navegador só desenha a página.
 *
 * Aqui mora a ESCOLHA dos ids (e a contagem); quem monta cada produto continua
 * sendo a rota dele, com a mesma resposta de antes, só que para os ids da
 * página. As consultas são cruas pelo mesmo motivo da busca da vitrine: busca
 * sem acento, `EXISTS` sobre variações e soma de estoque × preço não têm
 * equivalente no construtor tipado. Rodam na transação da requisição, e a
 * política do banco continua decidindo o que cada uma enxerga (P-004); o
 * `store_id` explícito só ajuda o índice.
 */
import { z } from "zod";

import type { TransacaoDoBanco } from "../../core/db.ts";

/**
 * Um pedaço de SQL com os valores à parte. Os filtros se combinam como
 * trechos (`sql\`AND ${outro}\``), e só no fim viram texto com `$1, $2…`:
 * valor nunca entra no texto da consulta.
 */
class Trecho {
  readonly partes: readonly string[];
  readonly valores: readonly unknown[];

  constructor(partes: readonly string[], valores: readonly unknown[]) {
    this.partes = partes;
    this.valores = valores;
  }
}

function sql(partes: TemplateStringsArray, ...valores: unknown[]): Trecho {
  const texto: string[] = [partes[0] ?? ""];
  const soltos: unknown[] = [];
  valores.forEach((valor, indice) => {
    const seguinte = partes[indice + 1] ?? "";
    if (valor instanceof Trecho) {
      // Embute o trecho: a primeira parte dele cola na última de cá.
      texto[texto.length - 1] += valor.partes[0] ?? "";
      texto.push(...valor.partes.slice(1));
      soltos.push(...valor.valores);
      texto[texto.length - 1] += seguinte;
    } else {
      soltos.push(valor);
      texto.push(seguinte);
    }
  });
  return new Trecho(texto, soltos);
}

const VAZIO = new Trecho([""], []);

/** Roda o trecho na transação, com os valores como parâmetros (`$1…`). */
function consultar<T>(tx: TransacaoDoBanco, trecho: Trecho): Promise<T> {
  const texto = trecho.partes.reduce(
    (montado, parte, indice) =>
      indice === 0 ? parte : `${montado}$${indice}${parte}`,
    "",
  );
  return tx.$queryRawUnsafe<T>(texto, ...trecho.valores);
}

export const POR_PAGINA_PADRAO = 50;
export const POR_PAGINA_MAXIMO = 100;
/** O termo da busca, cortado: ninguém digita um parágrafo para achar peça. */
const MAXIMO_DO_TERMO = 80;

const pagina = z.coerce.number().int().min(1).max(100_000).catch(1);
const porPagina = z.coerce
  .number()
  .int()
  .min(10)
  .max(POR_PAGINA_MAXIMO)
  .catch(POR_PAGINA_PADRAO);
const termo = z
  .string()
  .transform((bruto) => bruto.trim().slice(0, MAXIMO_DO_TERMO).trim())
  .catch("");
/** Id de categoria, `sem` (sem categoria) ou vazio (todas). */
const categoria = z
  .union([z.literal("sem"), z.string().uuid(), z.literal("")])
  .catch("");

export const SITUACOES_DO_PRODUTO = [
  "publicado",
  "rascunho",
  "esgotado",
  "estoque-baixo",
  "atacado",
  "indisponivel",
] as const;
/** Estoque do produto: em estoque, no aviso de mínimo ou esgotado. */
export const ESTOQUES_DO_PRODUTO = ["em-estoque", "baixo", "esgotado"] as const;
export const ORDENS_DOS_PRODUTOS = [
  "manual",
  "nome",
  "nome-desc",
  "preco",
  "preco-desc",
  "recentes",
  "estoque",
  "estoque-desc",
  "vendidos",
] as const;

/** Centavos inteiros e positivos; texto torto vira "sem limite". */
const centavos = z
  .union([z.literal(""), z.coerce.number().int().min(0).max(100_000_000_00)])
  .catch("");

export const esquemaDaConsultaDeProdutos = z.object({
  pagina,
  porPagina,
  busca: termo.default(""),
  categoria: categoria.default(""),
  situacao: z.enum(SITUACOES_DO_PRODUTO).or(z.literal("")).catch(""),
  marca: termo.default(""),
  /** Estoque (combina com a situação). */
  estoque: z.enum(ESTOQUES_DO_PRODUTO).or(z.literal("")).catch(""),
  /** Com ou sem vídeo cadastrado. */
  video: z.enum(["com", "sem"]).or(z.literal("")).catch(""),
  /** Marcado (ou não) para aparecer no feed. */
  feed: z.enum(["sim", "nao"]).or(z.literal("")).catch(""),
  /** Faixa de preço, em centavos; vazio = sem limite. */
  precoMin: centavos.default(""),
  precoMax: centavos.default(""),
  ordem: z.enum(ORDENS_DOS_PRODUTOS).catch("manual"),
});
export type ConsultaDeProdutos = z.infer<typeof esquemaDaConsultaDeProdutos>;

export const SITUACOES_DO_ESTOQUE = [
  "falta",
  "baixo",
  "normal",
  "sem-controle",
] as const;
export const ORDENS_DO_ESTOQUE = [
  "situacao",
  "nome",
  "menor-estoque",
  "maior-estoque",
  "categoria",
] as const;

export const esquemaDaConsultaDoEstoque = z.object({
  pagina,
  porPagina,
  busca: termo.default(""),
  categoria: categoria.default(""),
  situacao: z.enum(SITUACOES_DO_ESTOQUE).or(z.literal("")).catch(""),
  ordem: z.enum(ORDENS_DO_ESTOQUE).catch("situacao"),
});
export type ConsultaDoEstoque = z.infer<typeof esquemaDaConsultaDoEstoque>;

export const esquemaDaConsultaDaGrade = z.object({
  pagina,
  porPagina,
  busca: termo.default(""),
  categoria: categoria.default(""),
  mostrar: z.enum(["com", "sem", "todos"]).catch("com"),
  /** Só nas opções: o tipo do grupo (`ADDON`, `INGREDIENT`, `VARIATION`). */
  tipo: z.enum(["ADDON", "INGREDIENT", "VARIATION"]).or(z.literal("")).catch(""),
});
export type ConsultaDaGrade = z.infer<typeof esquemaDaConsultaDaGrade>;

/** Lê a consulta da URL; o que vier torto cai no padrão, sem 400. */
export function lerConsulta<T>(
  esquema: z.ZodType<T>,
  query: Record<string, unknown>,
): T {
  const plano = Object.fromEntries(
    Object.entries(query).map(([chave, valor]) => [
      chave,
      Array.isArray(valor) ? valor[0] : valor,
    ]),
  );
  return esquema.parse(plano);
}

/** A lista pede página quando manda qualquer um destes. */
export function pedePagina(query: Record<string, unknown>): boolean {
  return [
    "pagina",
    "porPagina",
    "busca",
    "categoria",
    "situacao",
    "marca",
    "ordem",
    "estoque",
    "video",
    "feed",
    "precoMin",
    "precoMax",
  ].some(
    (chave) => query[chave] !== undefined,
  );
}

export interface Paginacao {
  readonly pagina: number;
  readonly porPagina: number;
  readonly total: number;
  readonly totalDePaginas: number;
}

function paginacao(
  consulta: { readonly pagina: number; readonly porPagina: number },
  total: number,
): Paginacao {
  return {
    pagina: consulta.pagina,
    porPagina: consulta.porPagina,
    total,
    totalDePaginas: Math.max(1, Math.ceil(total / consulta.porPagina)),
  };
}

const deslocamento = (consulta: { pagina: number; porPagina: number }) =>
  (consulta.pagina - 1) * consulta.porPagina;

const CLASSES_DE_ACENTO: Readonly<Record<string, string>> = {
  a: "aáàâãäÁÀÂÃÄ",
  e: "eéèêëÉÈÊË",
  i: "iíìîïÍÌÎÏ",
  o: "oóòôõöÓÒÔÕÖ",
  u: "uúùûüÚÙÛÜ",
  c: "cçÇ",
  n: "nñÑ",
};

/**
 * O termo como expressão regular que ignora acento e caixa (para `~*`):
 * "acai" vira `a[cçÇ][aáà…][iíì…]` e acha "AÇAÍ".
 *
 * POR QUE NÃO `lower(app.sem_acento(nome)) LIKE`: com a política de linha
 * ligada o banco não usa índice para `LIKE` (o operador não é "leakproof") e
 * varre os produtos da loja; `translate` sobre texto UTF-8 em cada linha
 * custava ~250 ms em dez mil produtos, e a expressão regular com as classes
 * de acento faz a mesma busca em ~40 ms. As maiúsculas acentuadas vão na
 * classe porque o banco roda com `LC_CTYPE=C`, e aí `~*` só dobra ASCII.
 */
export function expressaoDaBusca(texto: string): string {
  const limpo = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return [...limpo]
    .map((letra) => {
      const classe = CLASSES_DE_ACENTO[letra];
      if (classe !== undefined) return `[${classe}]`;
      return /[.^$*+?()[\]{}|\\-]/.test(letra) ? `\\${letra}` : letra;
    })
    .join("");
}

/** A coluna casa com o termo, sem acento e sem caixa. */
const casa = (coluna: Trecho, texto: string) =>
  sql`${coluna} ~* ${expressaoDaBusca(texto)}`;

function filtroDeCategoria(valor: string): Trecho {
  if (valor === "") return VAZIO;
  if (valor === "sem") {
    return sql`AND NOT EXISTS (
      SELECT 1 FROM app.product_categories pc
       WHERE pc.store_id = p.store_id AND pc.product_id = p.id)`;
  }
  return sql`AND EXISTS (
    SELECT 1 FROM app.product_categories pc
     WHERE pc.store_id = p.store_id AND pc.product_id = p.id
       AND pc.category_id = ${valor}::uuid)`;
}

// As situações do produto, como condição sobre `p`. Cada uma é `p.id IN
// (subconsulta)`: o banco monta o conjunto UMA vez e confere cada produto num
// hash, em vez de um `EXISTS` por linha (que em dez mil produtos custava meio
// segundo só para contar os atalhos).
const ESGOTADO = (lojaId: string) => sql`p.id IN (
  SELECT v.product_id FROM app.product_variants v
   WHERE v.store_id = ${lojaId}::uuid AND v.deleted_at IS NULL
   GROUP BY v.product_id
  HAVING bool_and(v.stock_quantity IS NOT NULL AND v.stock_quantity <= 0))`;
/** A regra de `estaAcabando`: no aviso ou abaixo dele. */
const ACABANDO = (lojaId: string) => sql`p.id IN (
  SELECT v.product_id FROM app.product_variants v
   WHERE v.store_id = ${lojaId}::uuid AND v.deleted_at IS NULL
     AND v.stock_quantity IS NOT NULL AND v.stock_min_alert IS NOT NULL
     AND v.stock_quantity <= v.stock_min_alert)`;
/** A regra de `pedidoMinimoDosProdutos`: faixa ligada, vigente e coerente. */
const COM_ATACADO = (lojaId: string, agora: Date) => sql`p.id IN (
  SELECT pp.product_id FROM app.product_prices pp
    JOIN app.products q ON q.id = pp.product_id AND q.store_id = pp.store_id
   WHERE pp.store_id = ${lojaId}::uuid
     AND pp.kind = 'WHOLESALE' AND pp.is_active
     AND (pp.starts_at IS NULL OR pp.starts_at <= ${agora})
     AND (pp.ends_at IS NULL OR pp.ends_at > ${agora})
     AND NOT coalesce(
           (pp.discount_kind = 'AMOUNT'
              AND pp.discount_value >= q.display_price_cents)
           OR (pp.discount_kind IS NULL
              AND pp.amount_cents >= q.display_price_cents),
           false))`;

function filtroDeSituacao(
  situacao: ConsultaDeProdutos["situacao"],
  lojaId: string,
  agora: Date,
): Trecho {
  switch (situacao) {
    case "publicado":
      return sql`AND p.status = 'PUBLISHED'`;
    case "rascunho":
      return sql`AND p.status <> 'PUBLISHED'`;
    case "esgotado":
      return sql`AND ${ESGOTADO(lojaId)}`;
    case "estoque-baixo":
      return sql`AND ${ACABANDO(lojaId)}`;
    case "atacado":
      return sql`AND ${COM_ATACADO(lojaId, agora)}`;
    case "indisponivel":
      return sql`AND NOT p.is_available`;
    case "":
      return VAZIO;
  }
}

function filtroDeEstoque(
  estoque: ConsultaDeProdutos["estoque"],
  lojaId: string,
): Trecho {
  switch (estoque) {
    case "esgotado":
      return sql`AND ${ESGOTADO(lojaId)}`;
    case "baixo":
      return sql`AND ${ACABANDO(lojaId)}`;
    case "em-estoque":
      return sql`AND NOT ${ESGOTADO(lojaId)} AND NOT ${ACABANDO(lojaId)}`;
    case "":
      return VAZIO;
  }
}

const COM_VIDEO = (lojaId: string) => sql`p.id IN (
  SELECT pv.product_id FROM app.product_videos pv
   WHERE pv.store_id = ${lojaId}::uuid)`;

function filtrosExtras(consulta: ConsultaDeProdutos, lojaId: string): Trecho {
  const video =
    consulta.video === ""
      ? VAZIO
      : consulta.video === "com"
        ? sql`AND ${COM_VIDEO(lojaId)}`
        : sql`AND NOT ${COM_VIDEO(lojaId)}`;
  const feed =
    consulta.feed === ""
      ? VAZIO
      : sql`AND p.publish_to_feed = ${consulta.feed === "sim"}`;
  const minimo =
    consulta.precoMin === ""
      ? VAZIO
      : sql`AND p.display_price_cents >= ${consulta.precoMin}::bigint`;
  const maximo =
    consulta.precoMax === ""
      ? VAZIO
      : sql`AND p.display_price_cents <= ${consulta.precoMax}::bigint`;
  return sql`${video} ${feed} ${minimo} ${maximo}`;
}

/**
 * Ordens que dependem de uma soma (estoque, vendas) entram por junção com o
 * conjunto já agrupado, e só quando a ordem pede: em dez mil produtos, uma
 * subconsulta por linha custaria segundos.
 */
function juncaoDaOrdem(
  ordem: ConsultaDeProdutos["ordem"],
  lojaId: string,
): Trecho {
  if (ordem === "estoque" || ordem === "estoque-desc") {
    return sql`LEFT JOIN (
      SELECT v.product_id, sum(v.stock_quantity) AS qtd
        FROM app.product_variants v
       WHERE v.store_id = ${lojaId}::uuid AND v.deleted_at IS NULL
         AND v.stock_quantity IS NOT NULL
       GROUP BY v.product_id) ordem_estoque ON ordem_estoque.product_id = p.id`;
  }
  if (ordem === "vendidos") {
    return sql`LEFT JOIN (
      SELECT oi.product_id, sum(oi.quantity) AS vendidos
        FROM app.order_items oi
        JOIN app.orders o ON o.id = oi.order_id AND o.store_id = oi.store_id
       WHERE oi.store_id = ${lojaId}::uuid AND o.status <> 'CANCELLED'
         AND oi.product_id IS NOT NULL
       GROUP BY oi.product_id) ordem_vendas ON ordem_vendas.product_id = p.id`;
  }
  return VAZIO;
}

const ORDEM_DOS_PRODUTOS: Readonly<
  Record<ConsultaDeProdutos["ordem"], Trecho>
> = {
  manual: sql`p.sort_order ASC, p.name ASC, p.id ASC`,
  // `lower(name)`: o índice da 0070 cobre (sem `translate` por linha).
  nome: sql`lower(p.name) ASC, p.id ASC`,
  "nome-desc": sql`lower(p.name) DESC, p.id DESC`,
  // Sem preço vai para o fim nos dois sentidos: não é "grátis".
  preco: sql`p.display_price_cents ASC NULLS LAST, p.name ASC, p.id ASC`,
  "preco-desc": sql`p.display_price_cents DESC NULLS LAST, p.name ASC, p.id ASC`,
  recentes: sql`p.created_at DESC, p.id DESC`,
  // Sem controle de estoque vai para o fim nos dois sentidos.
  estoque: sql`ordem_estoque.qtd ASC NULLS LAST, lower(p.name) ASC, p.id ASC`,
  "estoque-desc": sql`ordem_estoque.qtd DESC NULLS LAST, lower(p.name) ASC, p.id ASC`,
  vendidos: sql`coalesce(ordem_vendas.vendidos, 0) DESC, lower(p.name) ASC, p.id ASC`,
};

export interface PaginaDeProdutos extends Paginacao {
  readonly ids: readonly string[];
  /** Contagens da loja toda, para os atalhos da lista. */
  readonly resumo: {
    readonly todos: number;
    readonly estoqueBaixo: number;
    readonly comAtacado: number;
  };
}

/** Os ids da página de produtos, na ordem pedida, e quantos casam no total. */
export async function paginaDeProdutos(
  tx: TransacaoDoBanco,
  lojaId: string,
  consulta: ConsultaDeProdutos,
  agora: Date = new Date(),
): Promise<PaginaDeProdutos> {
  // O produto casa pelo nome, pelo código do fornecedor, pela referência ou
  // pelo SKU de alguma variação viva.
  const busca =
    consulta.busca === ""
      ? VAZIO
      : sql`AND (
          ${casa(sql`p.name`, consulta.busca)}
          OR ${casa(sql`coalesce(p.attributes->>'codigoDoFornecedor', '')`, consulta.busca)}
          OR ${casa(sql`coalesce(p.attributes->>'referencia', '')`, consulta.busca)}
          OR ${casa(sql`coalesce(p.description, '')`, consulta.busca)}
          OR p.id IN (SELECT v.product_id FROM app.product_variants v
                       WHERE v.store_id = ${lojaId}::uuid AND v.deleted_at IS NULL
                         AND ${casa(sql`v.sku`, consulta.busca)}))`;
  const marca =
    consulta.marca === ""
      ? VAZIO
      : sql`AND lower(p.attributes->>'marca') = lower(${consulta.marca})`;
  const onde = sql`
    WHERE p.store_id = ${lojaId}::uuid AND p.deleted_at IS NULL
      ${busca} ${marca}
      ${filtroDeCategoria(consulta.categoria)}
      ${filtroDeSituacao(consulta.situacao, lojaId, agora)}
      ${filtroDeEstoque(consulta.estoque, lojaId)}
      ${filtrosExtras(consulta, lojaId)}`;

  const linhas = await consultar<{ id: string; total: bigint }[]>(tx, sql`
    SELECT p.id::text AS id, count(*) OVER () AS total
      FROM app.products p
      ${juncaoDaOrdem(consulta.ordem, lojaId)}
      ${onde}
     ORDER BY ${ORDEM_DOS_PRODUTOS[consulta.ordem]}
     LIMIT ${consulta.porPagina} OFFSET ${deslocamento(consulta)}`);
  let total = Number(linhas[0]?.total ?? 0);
  if (linhas.length === 0 && consulta.pagina > 1) {
    // Página depois do fim (a lista encolheu): conta sem a página.
    const [contagem] = await consultar<{ total: bigint }[]>(tx, sql`
      SELECT count(*) AS total FROM app.products p ${onde}`);
    total = Number(contagem?.total ?? 0);
  }

  const [resumo] = await consultar<
    { todos: bigint; acabando: bigint; atacado: bigint }[]
  >(tx, sql`
    SELECT count(*) AS todos,
           count(*) FILTER (WHERE ${ACABANDO(lojaId)}) AS acabando,
           count(*) FILTER (WHERE ${COM_ATACADO(lojaId, agora)}) AS atacado
      FROM app.products p
     WHERE p.store_id = ${lojaId}::uuid AND p.deleted_at IS NULL`);

  return {
    ...paginacao(consulta, total),
    ids: linhas.map((linha) => linha.id),
    resumo: {
      todos: Number(resumo?.todos ?? 0),
      estoqueBaixo: Number(resumo?.acabando ?? 0),
      comAtacado: Number(resumo?.atacado ?? 0),
    },
  };
}

/** As marcas que aparecem nos produtos (o atributo `marca`), A a Z. */
export async function marcasDaLoja(
  tx: TransacaoDoBanco,
  lojaId: string,
): Promise<string[]> {
  const linhas = await consultar<{ marca: string }[]>(tx, sql`
    SELECT min(btrim(p.attributes->>'marca')) AS marca
      FROM app.products p
     WHERE p.store_id = ${lojaId}::uuid AND p.deleted_at IS NULL
       AND coalesce(btrim(p.attributes->>'marca'), '') <> ''
     GROUP BY lower(btrim(p.attributes->>'marca'))
     ORDER BY lower(app.sem_acento(min(btrim(p.attributes->>'marca'))))
     LIMIT 1000`);
  return linhas.map((linha) => linha.marca);
}

export interface CategoriasDoPainel {
  readonly categorias: readonly { readonly valor: string; readonly rotulo: string }[];
}

/** As categorias para o filtro (A a Z), com "Sem categoria" se houver. */
export async function categoriasDoFiltro(
  tx: TransacaoDoBanco,
  lojaId: string,
): Promise<{ valor: string; rotulo: string }[]> {
  const linhas = await consultar<{ id: string; nome: string }[]>(tx, sql`
    SELECT c.id::text AS id, c.name AS nome
      FROM app.categories c
     WHERE c.store_id = ${lojaId}::uuid AND c.deleted_at IS NULL
     ORDER BY lower(app.sem_acento(c.name)), c.id`);
  const [sem] = await consultar<{ existe: boolean }[]>(tx, sql`
    SELECT EXISTS (
      SELECT 1 FROM app.products p
       WHERE p.store_id = ${lojaId}::uuid AND p.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM app.product_categories pc
                          WHERE pc.store_id = p.store_id
                            AND pc.product_id = p.id)) AS existe`);
  return [
    ...linhas.map((linha) => ({ valor: linha.id, rotulo: linha.nome })),
    ...(sem?.existe ? [{ valor: "sem", rotulo: "Sem categoria" }] : []),
  ];
}

// ---------------------------------------------------------------------------
// Estoque: uma linha por variação (ou pelo produto sem variação nenhuma)
// ---------------------------------------------------------------------------

/**
 * As linhas do estoque, com o preço que vale agora (promoção antes da base,
 * o menor de cada tipo, como `precoQueVale`) e a situação de cada uma.
 *
 * Preço e categoria entram por JUNÇÃO com o conjunto já agrupado, e não por
 * subconsulta em cada linha: em dez mil variações a diferença é de segundos.
 * Cada um só entra quando a consulta usa (`comPreco`, `comCategoria`).
 */
const LINHAS_DO_ESTOQUE = (
  lojaId: string,
  agora: Date,
  { comPreco, comCategoria }: { comPreco: boolean; comCategoria: boolean },
) => sql`
  SELECT p.id AS produto_id,
         v.id AS variacao_id,
         p.name AS produto_nome,
         v.name AS variacao_nome,
         v.sku,
         v.stock_quantity AS quantidade,
         count(v.id) OVER (PARTITION BY p.id) <= 1 AS unica,
         CASE
           WHEN v.stock_quantity IS NULL THEN 'sem-controle'
           WHEN v.stock_quantity <= 0 THEN 'falta'
           WHEN v.stock_min_alert IS NOT NULL
                AND v.stock_quantity <= v.stock_min_alert THEN 'baixo'
           ELSE 'normal'
         END AS situacao,
         ${comPreco ? sql`CASE WHEN v.id IS NULL THEN p.display_price_cents ELSE pr.preco END` : sql`NULL::bigint`} AS preco,
         ${comCategoria ? sql`cat.nome` : sql`NULL::text`} AS categoria_nome
    FROM app.products p
    LEFT JOIN app.product_variants v
      ON v.store_id = p.store_id AND v.product_id = p.id AND v.deleted_at IS NULL
    ${
      comPreco
        ? sql`LEFT JOIN (
      SELECT pp.variant_id,
             coalesce(min(pp.amount_cents) FILTER (WHERE pp.kind = 'PROMO'),
                      min(pp.amount_cents) FILTER (WHERE pp.kind = 'BASE')) AS preco
        FROM app.product_prices pp
       WHERE pp.store_id = ${lojaId}::uuid AND pp.variant_id IS NOT NULL
         AND pp.kind IN ('BASE', 'PROMO') AND pp.is_active
         AND pp.min_quantity <= 1
         AND (pp.starts_at IS NULL OR pp.starts_at <= ${agora})
         AND (pp.ends_at IS NULL OR pp.ends_at > ${agora})
       GROUP BY pp.variant_id) pr ON pr.variant_id = v.id`
        : VAZIO
    }
    ${
      comCategoria
        ? sql`LEFT JOIN (
      SELECT DISTINCT ON (pc.product_id) pc.product_id, c.name AS nome
        FROM app.product_categories pc
        JOIN app.categories c ON c.id = pc.category_id
       WHERE pc.store_id = ${lojaId}::uuid
       ORDER BY pc.product_id, pc.is_primary DESC, pc.created_at ASC) cat
      ON cat.product_id = p.id`
        : VAZIO
    }
   WHERE p.store_id = ${lojaId}::uuid AND p.deleted_at IS NULL`;

const ORDEM_DO_ESTOQUE: Readonly<Record<ConsultaDoEstoque["ordem"], Trecho>> =
  {
    nome: sql`lower(l.nome_da_linha) ASC`,
    "menor-estoque": sql`l.quantidade ASC NULLS LAST, lower(l.nome_da_linha) ASC`,
    "maior-estoque": sql`l.quantidade DESC NULLS LAST, lower(l.nome_da_linha) ASC`,
    categoria: sql`lower(l.categoria_nome) ASC NULLS LAST, lower(l.nome_da_linha) ASC`,
    situacao: sql`CASE l.situacao WHEN 'falta' THEN 0 WHEN 'baixo' THEN 1
                           WHEN 'normal' THEN 2 ELSE 3 END ASC, lower(l.nome_da_linha) ASC`,
  };

export interface IndicadoresDoEstoque {
  readonly emFalta: number;
  readonly estoqueBaixo: number;
  readonly totalDeItens: number;
  readonly valorEstimadoCentavos: number;
}

export interface LinhaDaPaginaDoEstoque {
  readonly produtoId: string;
  /** Nulo: o produto ainda não tem variação nenhuma. */
  readonly variacaoId: string | null;
  readonly unica: boolean;
  readonly situacao: (typeof SITUACOES_DO_ESTOQUE)[number];
}

export interface PaginaDoEstoque extends Paginacao {
  readonly linhas: readonly LinhaDaPaginaDoEstoque[];
  /** Da loja toda (não muda com o filtro). */
  readonly indicadores: IndicadoresDoEstoque;
  /** Quantas linhas a loja tem sem filtro nenhum. */
  readonly totalDaLoja: number;
}

export async function paginaDoEstoque(
  tx: TransacaoDoBanco,
  lojaId: string,
  consulta: ConsultaDoEstoque,
  agora: Date = new Date(),
): Promise<PaginaDoEstoque> {
  const busca =
    consulta.busca === ""
      ? VAZIO
      : sql`AND (${casa(sql`l.nome_da_linha`, consulta.busca)}
                        OR ${casa(sql`coalesce(l.sku, '')`, consulta.busca)})`;
  const situacao =
    consulta.situacao === ""
      ? VAZIO
      : sql`AND l.situacao = ${consulta.situacao}`;
  // O filtro de categoria olha o produto da linha (`p` dentro do EXISTS).
  const categoria =
    consulta.categoria === ""
      ? VAZIO
      : sql`AND EXISTS (SELECT 1 FROM app.products p
                                WHERE p.id = l.produto_id
                                  ${filtroDeCategoria(consulta.categoria)})`;

  const daPagina = LINHAS_DO_ESTOQUE(lojaId, agora, {
    comPreco: false,
    comCategoria: consulta.ordem === "categoria",
  });
  const linhas = await consultar<
    {
      produto_id: string;
      variacao_id: string | null;
      unica: boolean;
      situacao: LinhaDaPaginaDoEstoque["situacao"];
      total: bigint;
    }[]
  >(tx, sql`
    WITH base AS (${daPagina}),
    l AS (
      SELECT base.*,
             base.produto_nome
               || CASE WHEN base.unica OR base.variacao_nome IS NULL THEN ''
                       ELSE ' ' || base.variacao_nome END AS nome_da_linha
        FROM base)
    SELECT l.produto_id::text AS produto_id, l.variacao_id::text AS variacao_id,
           l.unica, l.situacao, count(*) OVER () AS total
      FROM l
     WHERE true ${busca} ${situacao} ${categoria}
     ORDER BY ${ORDEM_DO_ESTOQUE[consulta.ordem]}, l.produto_id, l.variacao_id
     LIMIT ${consulta.porPagina} OFFSET ${deslocamento(consulta)}`);

  const [numeros] = await consultar<
    {
      linhas: bigint;
      em_falta: bigint;
      baixo: bigint;
      itens: bigint | null;
      valor: bigint | null;
    }[]
  >(tx, sql`
    WITH l AS (${LINHAS_DO_ESTOQUE(lojaId, agora, { comPreco: true, comCategoria: false })})
    SELECT count(*) AS linhas,
           count(*) FILTER (WHERE situacao = 'falta') AS em_falta,
           count(*) FILTER (WHERE situacao = 'baixo') AS baixo,
           sum(greatest(coalesce(quantidade, 0), 0)) AS itens,
           sum(greatest(coalesce(quantidade, 0), 0)::bigint * coalesce(preco, 0)) AS valor
      FROM l`);

  let total = Number(linhas[0]?.total ?? 0);
  if (linhas.length === 0 && consulta.pagina > 1) {
    const [contagem] = await consultar<{ total: bigint }[]>(tx, sql`
      WITH base AS (${daPagina}),
      l AS (
        SELECT base.*,
               base.produto_nome
                 || CASE WHEN base.unica OR base.variacao_nome IS NULL THEN ''
                         ELSE ' ' || base.variacao_nome END AS nome_da_linha
          FROM base)
      SELECT count(*) AS total FROM l WHERE true ${busca} ${situacao} ${categoria}`);
    total = Number(contagem?.total ?? 0);
  }

  return {
    ...paginacao(consulta, total),
    linhas: linhas.map((linha) => ({
      produtoId: linha.produto_id,
      variacaoId: linha.variacao_id,
      unica: linha.unica,
      situacao: linha.situacao,
    })),
    totalDaLoja: Number(numeros?.linhas ?? 0),
    indicadores: {
      emFalta: Number(numeros?.em_falta ?? 0),
      estoqueBaixo: Number(numeros?.baixo ?? 0),
      totalDeItens: Number(numeros?.itens ?? 0),
      valorEstimadoCentavos: Number(numeros?.valor ?? 0),
    },
  };
}

// ---------------------------------------------------------------------------
// Variações e opções: produtos com (ou sem) grade, com (ou sem) grupos
// ---------------------------------------------------------------------------

/** Tem grade: mais de uma variação viva, ou uma que não é a padrão. */
const TEM_GRADE = (lojaId: string) => sql`p.id IN (
  SELECT v.product_id FROM app.product_variants v
   WHERE v.store_id = ${lojaId}::uuid AND v.deleted_at IS NULL
   GROUP BY v.product_id
  HAVING count(*) > 1 OR bool_or(NOT v.is_default))`;

/** Produtos com algum grupo de escolha que não é eixo de variação. */
const COM_GRUPO = (lojaId: string, extra: Trecho = VAZIO) =>
  sql`p.id IN (
    SELECT pog.product_id FROM app.product_option_groups pog
      JOIN app.option_groups g ON g.id = pog.group_id AND g.deleted_at IS NULL
     WHERE pog.store_id = ${lojaId}::uuid AND NOT g.is_variant_axis ${extra})`;

export interface PaginaDaGrade extends Paginacao {
  readonly ids: readonly string[];
  readonly indicadores: Readonly<Record<string, number>>;
  /** Quantos produtos a loja tem, sem filtro nenhum. */
  readonly totalDaLoja: number;
}

export async function paginaDaGrade(
  tx: TransacaoDoBanco,
  lojaId: string,
  recorte: "variacoes" | "opcoes",
  consulta: ConsultaDaGrade,
): Promise<PaginaDaGrade> {
  const termo = consulta.busca;
  const temAlgo = recorte === "variacoes" ? TEM_GRADE(lojaId) : COM_GRUPO(lojaId);
  const mostrar =
    consulta.mostrar === "todos"
      ? VAZIO
      : consulta.mostrar === "com"
        ? sql`AND ${temAlgo}`
        : sql`AND NOT ${temAlgo}`;
  const tipo =
    recorte === "opcoes" && consulta.tipo !== ""
      ? sql`AND ${COM_GRUPO(lojaId, sql`AND g.kind = ${consulta.tipo}`)}`
      : VAZIO;
  const buscaExtra =
    recorte === "variacoes"
      ? sql`OR p.id IN (SELECT v.product_id FROM app.product_variants v
                     WHERE v.store_id = ${lojaId}::uuid AND v.deleted_at IS NULL
                       AND (${casa(sql`v.name`, termo)}
                            OR ${casa(sql`coalesce(v.sku, '')`, termo)}))`
      : sql`OR ${COM_GRUPO(
          lojaId,
          sql`AND (${casa(sql`g.name`, termo)}
                          OR g.id IN (SELECT i.group_id FROM app.option_items i
                                       WHERE i.store_id = ${lojaId}::uuid
                                         AND i.deleted_at IS NULL
                                         AND ${casa(sql`i.name`, termo)}))`,
        )}`;
  const busca =
    consulta.busca === ""
      ? VAZIO
      : sql`AND (${casa(sql`p.name`, termo)} ${buscaExtra})`;

  const linhas = await consultar<{ id: string; total: bigint }[]>(tx, sql`
    SELECT p.id::text AS id, count(*) OVER () AS total
      FROM app.products p
     WHERE p.store_id = ${lojaId}::uuid AND p.deleted_at IS NULL
       ${mostrar} ${tipo} ${busca} ${filtroDeCategoria(consulta.categoria)}
     ORDER BY p.sort_order ASC, p.name ASC, p.id ASC
     LIMIT ${consulta.porPagina} OFFSET ${deslocamento(consulta)}`);
  let total = Number(linhas[0]?.total ?? 0);
  if (linhas.length === 0 && consulta.pagina > 1) {
    const [contagem] = await consultar<{ total: bigint }[]>(tx, sql`
      SELECT count(*) AS total FROM app.products p
       WHERE p.store_id = ${lojaId}::uuid AND p.deleted_at IS NULL
         ${mostrar} ${tipo} ${busca} ${filtroDeCategoria(consulta.categoria)}`);
    total = Number(contagem?.total ?? 0);
  }

  const [daLoja] = await consultar<{ total: bigint }[]>(tx, sql`
    SELECT count(*) AS total FROM app.products p
     WHERE p.store_id = ${lojaId}::uuid AND p.deleted_at IS NULL`);

  return {
    ...paginacao(consulta, total),
    ids: linhas.map((linha) => linha.id),
    totalDaLoja: Number(daLoja?.total ?? 0),
    indicadores:
      recorte === "variacoes"
        ? await indicadoresDasVariacoes(tx, lojaId)
        : await indicadoresDasOpcoes(tx, lojaId),
  };
}

async function indicadoresDasVariacoes(
  tx: TransacaoDoBanco,
  lojaId: string,
): Promise<Record<string, number>> {
  const [linha] = await consultar<
    { produtos: bigint; com_grade: bigint; variacoes: bigint | null; em_falta: bigint | null }[]
  >(tx, sql`
    WITH p AS (
      SELECT p.id, p.store_id, ${TEM_GRADE(lojaId)} AS com_grade
        FROM app.products p
       WHERE p.store_id = ${lojaId}::uuid AND p.deleted_at IS NULL)
    SELECT count(*) AS produtos,
           count(*) FILTER (WHERE p.com_grade) AS com_grade,
           (SELECT count(*) FROM app.product_variants v JOIN p ON p.id = v.product_id
             WHERE p.com_grade AND v.deleted_at IS NULL) AS variacoes,
           (SELECT count(*) FROM app.product_variants v JOIN p ON p.id = v.product_id
             WHERE p.com_grade AND v.deleted_at IS NULL
               AND v.stock_quantity IS NOT NULL AND v.stock_quantity <= 0) AS em_falta
      FROM p`);
  const produtos = Number(linha?.produtos ?? 0);
  const comGrade = Number(linha?.com_grade ?? 0);
  return {
    produtosComVariacoes: comGrade,
    variacoesCadastradas: Number(linha?.variacoes ?? 0),
    variacoesEmFalta: Number(linha?.em_falta ?? 0),
    produtosSemVariacoes: produtos - comGrade,
  };
}

async function indicadoresDasOpcoes(
  tx: TransacaoDoBanco,
  lojaId: string,
): Promise<Record<string, number>> {
  const [linha] = await consultar<
    { produtos: bigint; grupos: bigint; obrigatorios: bigint; opcoes: bigint | null }[]
  >(tx, sql`
    WITH g AS (
      SELECT pog.product_id, g.id, g.min_select
        FROM app.product_option_groups pog
        JOIN app.products p ON p.id = pog.product_id AND p.deleted_at IS NULL
        JOIN app.option_groups g ON g.id = pog.group_id AND g.deleted_at IS NULL
       WHERE pog.store_id = ${lojaId}::uuid AND NOT g.is_variant_axis)
    SELECT count(DISTINCT g.product_id) AS produtos,
           count(*) AS grupos,
           count(*) FILTER (WHERE g.min_select > 0) AS obrigatorios,
           (SELECT count(*) FROM g g2
              JOIN app.option_items i ON i.group_id = g2.id AND i.deleted_at IS NULL)
             AS opcoes
      FROM g`);
  return {
    produtosComOpcoes: Number(linha?.produtos ?? 0),
    gruposDeOpcoes: Number(linha?.grupos ?? 0),
    gruposObrigatorios: Number(linha?.obrigatorios ?? 0),
    opcoesCadastradas: Number(linha?.opcoes ?? 0),
  };
}
