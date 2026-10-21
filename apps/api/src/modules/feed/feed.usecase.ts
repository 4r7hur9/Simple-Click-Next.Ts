/**
 * Leituras e marcas do feed (card #25).
 *
 * As leituras atravessam lojas e por isso passam pelas funções do banco com
 * lista fechada de campos (`app.feed_produtos`, `app.feed_lojas`, migração
 * 0050): nada daqui lê `stores` ou `products` direto. Favoritos e recentes
 * são da pessoa da sessão — as políticas de `favorite_stores` e
 * `store_visits` só deixam cada um ver e mexer nos seus.
 *
 * Favoritos de produto (`favorite_products`, migração 0061, card #45) seguem a
 * mesma régua; a lista passa por `app.produtos_favoritos`. Recentes têm janela
 * (`JANELA_DOS_RECENTES_EM_DIAS`) e limite; favoritos não expiram.
 *
 * Tudo roda dentro da transação da requisição (`transacaoAtual`).
 */

import {
  atacadoLigado,
  buscaDaConsulta,
  FORMA_DE_RECEBER_NO_BANCO,
  iniciaisDaLoja,
  JANELA_MAXIMA_DOS_RECENTES_EM_DIAS,
  LIMITE_DOS_RECENTES,
  type MidiaPublica,
  temaDaLoja,
  tiposDaConsulta,
  type ConsultaDeLojasDoFeed,
  type ConsultaDeProdutosDoFeed,
  type LojaDoFeed,
  type ProdutoDoFeed,
  type ProdutoFavorito,
} from "@simpleclick/contracts";

import type { PrecoCadastrado } from "@simpleclick/core";

import {
  atacadoPublico,
  comoPrecoCadastrado,
} from "../../core/atacado-publico.ts";
import { transacaoAtual } from "../../core/db.ts";
import {
  resumoOuZero,
  socialDasLojas,
  socialDosProdutos,
} from "../../core/resumo-social.ts";

/** A ordem como o endereço a escreve → como o banco a entende. */
const ORDEM_DOS_PRODUTOS: Readonly<
  Record<ConsultaDeProdutosDoFeed["ordem"], string>
> = {
  relevancia: "RELEVANCIA",
  distancia: "DISTANCIA",
  "preco-menor": "PRECO_MENOR",
  "preco-maior": "PRECO_MAIOR",
  recentes: "RECENTES",
};

const ORDEM_DAS_LOJAS: Readonly<
  Record<ConsultaDeLojasDoFeed["ordem"], string>
> = {
  relevancia: "RELEVANCIA",
  distancia: "DISTANCIA",
  recentes: "RECENTES",
  nome: "NOME",
};

/** Escopo da lista de lojas. */
export type EscopoDasLojas = "TODAS" | "FAVORITAS" | "RECENTES";

/** Distância com uma casa decimal, ou nula. */
function distancia(valor: number | null): number | null {
  return valor === null || !Number.isFinite(valor)
    ? null
    : Math.round(valor * 10) / 10;
}

function inteiroOuNulo(valor: bigint | number | null): number | null {
  return valor === null ? null : Number(valor);
}

interface LinhaDoProdutoDoFeed {
  readonly product_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly price_cents: bigint | null;
  readonly compare_at_cents: bigint | null;
  readonly image_url: string | null;
  readonly category_name: string | null;
  readonly store_slug: string;
  readonly store_name: string;
  readonly store_vertical: string;
  readonly store_logo: string | null;
  readonly store_city: string | null;
  readonly store_neighborhood: string | null;
  readonly store_fulfillment_modes: string[];
  readonly distance_km: number | null;
  readonly published_at: Date;
  readonly total: bigint;
  /** Faceta de atacado: do resultado sem o filtro de atacado (card #59). */
  readonly total_with_wholesale: bigint;
}

export interface PaginaDoFeed<T> {
  readonly itens: readonly T[];
  readonly total: number;
}

/** A página de produtos traz também a faceta de atacado (card #59). */
export interface PaginaDeProdutosDoFeed extends PaginaDoFeed<ProdutoDoFeed> {
  readonly totalComAtacado: number;
}

/** Os produtos do feed, com os filtros da consulta. */
export async function produtosDoFeed(
  consulta: ConsultaDeProdutosDoFeed,
): Promise<PaginaDeProdutosDoFeed> {
  const entrega =
    consulta.entrega === undefined
      ? null
      : FORMA_DE_RECEBER_NO_BANCO[consulta.entrega];
  const linhas = await transacaoAtual().$queryRaw<LinhaDoProdutoDoFeed[]>`
    SELECT * FROM app.feed_produtos(
      ${buscaDaConsulta(consulta.busca) ?? null}::text,
      ${tiposDaConsulta(consulta.tipo)}::text[],
      ${consulta.categoria ?? null}::text,
      ${entrega}::text,
      ${consulta.lat ?? null}::double precision,
      ${consulta.lng ?? null}::double precision,
      ${ORDEM_DOS_PRODUTOS[consulta.ordem]}::text,
      ${consulta.porPagina}::integer,
      ${(consulta.pagina - 1) * consulta.porPagina}::integer,
      ${atacadoLigado(consulta.atacado)}::boolean,
      ${consulta.pedidoMinimo ?? null}::integer)`;

  const ids = linhas.map((l) => l.product_id);
  const midias = await midiasDosProdutos(ids);
  const favoritos = await produtosFavoritadosEntre(ids);
  // Curtidas e comentários aprovados (card #47).
  const social = await socialDosProdutos(ids);
  // As faixas de atacado do post (card #56).
  const atacado = await atacadoDosProdutos(ids);
  const agora = new Date();

  return {
    total: Number(linhas[0]?.total ?? 0),
    totalComAtacado: Number(linhas[0]?.total_with_wholesale ?? 0),
    itens: linhas.map((linha) => ({
      id: linha.product_id,
      nome: linha.name,
      descricao: linha.description,
      precoCentavos: inteiroOuNulo(linha.price_cents),
      precoOriginalCentavos: inteiroOuNulo(linha.compare_at_cents),
      imagem: linha.image_url,
      categoria: linha.category_name,
      loja: {
        apelido: linha.store_slug,
        nome: linha.store_name,
        tipoDeNegocio: linha.store_vertical,
        logo: linha.store_logo,
        fotoDePerfil: linha.store_logo,
        iniciais: iniciaisDaLoja(linha.store_name),
        cidade: linha.store_city,
        bairro: linha.store_neighborhood,
        formasDeEntrega: [...linha.store_fulfillment_modes],
      },
      distanciaKm: distancia(linha.distance_km),
      publicadoEm: linha.published_at.toISOString(),
      midias: midias.get(linha.product_id) ?? [],
      favorito: favoritos.has(linha.product_id),
      ...resumoOuZero(social, linha.product_id),
      // Sobre o mesmo preço que o post mostra.
      atacado: atacadoPublico(
        inteiroOuNulo(linha.price_cents),
        atacado.get(linha.product_id) ?? [],
        agora,
      ),
    })),
  };
}

interface LinhaDoAtacadoPublico {
  readonly product_id: string;
  readonly min_quantity: number;
  readonly amount_cents: bigint;
  readonly discount_kind: string | null;
  readonly discount_value: bigint | null;
  readonly label: string | null;
  readonly starts_at: Date | null;
  readonly ends_at: Date | null;
}

/**
 * As linhas de atacado ligadas e vigentes dos produtos (card #56), pela função
 * de lista fechada da migração 0067: uma consulta para a página inteira.
 */
async function atacadoDosProdutos(
  ids: readonly string[],
): Promise<Map<string, PrecoCadastrado[]>> {
  const porProduto = new Map<string, PrecoCadastrado[]>();
  if (ids.length === 0) return porProduto;
  const linhas = await transacaoAtual().$queryRaw<LinhaDoAtacadoPublico[]>`
    SELECT product_id::text, min_quantity, amount_cents, discount_kind,
           discount_value, label, starts_at, ends_at
      FROM app.atacado_publico_dos_produtos(${[...ids]}::uuid[])`;
  for (const linha of linhas) {
    const lista = porProduto.get(linha.product_id) ?? [];
    lista.push(
      comoPrecoCadastrado({
        kind: "WHOLESALE",
        amountCents: linha.amount_cents,
        minQuantity: linha.min_quantity,
        isActive: true,
        startsAt: linha.starts_at,
        endsAt: linha.ends_at,
        label: linha.label,
        discountKind: linha.discount_kind,
        discountValue: linha.discount_value,
      }),
    );
    porProduto.set(linha.product_id, lista);
  }
  return porProduto;
}

/**
 * Quais destes produtos a pessoa da sessão favoritou. Sem sessão a política
 * de `favorite_products` não devolve nada.
 */
async function produtosFavoritadosEntre(
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const linhas = await transacaoAtual().$queryRaw<{ product_id: string }[]>`
    SELECT product_id::text FROM app.favorite_products
     WHERE identity_id = app.current_user_id()
       AND product_id = ANY (${[...ids]}::uuid[])`;
  return new Set(linhas.map((linha) => linha.product_id));
}

interface LinhaDaMidiaPublica {
  readonly product_id: string;
  readonly kind: string;
  readonly url: string;
  readonly poster_url: string | null;
  readonly duration_ms: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly alt_text: string | null;
}

/**
 * Fotos e vídeos dos produtos, na ordem do dono (card #46). Uma consulta só
 * para a página inteira, pela função de lista fechada da migração 0060.
 */
async function midiasDosProdutos(
  ids: readonly string[],
): Promise<Map<string, MidiaPublica[]>> {
  const porProduto = new Map<string, MidiaPublica[]>();
  if (ids.length === 0) return porProduto;
  const linhas = await transacaoAtual().$queryRaw<LinhaDaMidiaPublica[]>`
    SELECT product_id, kind, url, poster_url, duration_ms, width, height, alt_text
      FROM app.midias_publicas_dos_produtos(${[...ids]}::uuid[])`;
  for (const linha of linhas) {
    const lista = porProduto.get(linha.product_id) ?? [];
    lista.push({
      tipo: linha.kind === "VIDEO" ? "video" : "imagem",
      url: linha.url,
      capa: linha.poster_url,
      duracaoSegundos:
        linha.duration_ms === null
          ? null
          : Math.round(linha.duration_ms / 100) / 10,
      largura: linha.width,
      altura: linha.height,
      texto: linha.alt_text,
    });
    porProduto.set(linha.product_id, lista);
  }
  return porProduto;
}

interface LinhaDaLojaDoFeed {
  readonly slug: string;
  readonly name: string;
  readonly vertical_code: string;
  readonly vertical_label: string;
  readonly city: string | null;
  readonly neighborhood: string | null;
  readonly uf: string | null;
  readonly fulfillment_modes: string[];
  readonly logo: string | null;
  readonly cover: string | null;
  readonly accent_color: string | null;
  readonly distance_km: number | null;
  readonly feed_products: number;
  readonly favorited_at: Date | null;
  readonly last_visited_at: Date | null;
  readonly total: bigint;
}

/** Os filtros que a lista de lojas aceita (o feed usa todos). */
export interface FiltrosDasLojas {
  readonly tipo?: string | undefined;
  readonly entrega?: ConsultaDeLojasDoFeed["entrega"] | undefined;
  readonly busca?: string | undefined;
  readonly lat?: number | undefined;
  readonly lng?: number | undefined;
  readonly ordem?: ConsultaDeLojasDoFeed["ordem"] | undefined;
  readonly pagina: number;
  readonly porPagina: number;
}

/** As lojas do feed, as favoritas ou as recentes da pessoa da sessão. */
export async function lojasDoFeed(
  filtros: FiltrosDasLojas,
  escopo: EscopoDasLojas,
): Promise<PaginaDoFeed<LojaDoFeed>> {
  const entrega =
    filtros.entrega === undefined
      ? null
      : FORMA_DE_RECEBER_NO_BANCO[filtros.entrega];
  const linhas = await transacaoAtual().$queryRaw<LinhaDaLojaDoFeed[]>`
    SELECT * FROM app.feed_lojas(
      ${buscaDaConsulta(filtros.busca) ?? null}::text,
      ${tiposDaConsulta(filtros.tipo)}::text[],
      ${entrega}::text,
      ${filtros.lat ?? null}::double precision,
      ${filtros.lng ?? null}::double precision,
      ${ORDEM_DAS_LOJAS[filtros.ordem ?? "relevancia"]}::text,
      ${filtros.porPagina}::integer,
      ${(filtros.pagina - 1) * filtros.porPagina}::integer,
      ${escopo}::text)`;

  // Curtidas e comentários na loja (card #47).
  const social = await socialDasLojas(linhas.map((l) => l.slug.toLowerCase()));

  return {
    total: Number(linhas[0]?.total ?? 0),
    itens: linhas.map((linha) => ({
      apelido: linha.slug,
      nome: linha.name,
      tipoDeNegocio: linha.vertical_code,
      tipoDeNegocioNome: linha.vertical_label,
      cidade: linha.city,
      bairro: linha.neighborhood,
      uf: linha.uf,
      formasDeEntrega: [...linha.fulfillment_modes],
      logo: linha.logo,
      fotoDePerfil: linha.logo,
      iniciais: iniciaisDaLoja(linha.name),
      capa: linha.cover,
      corDestaque: temaDaLoja({ corDestaque: linha.accent_color }).corDestaque,
      distanciaKm: distancia(linha.distance_km),
      produtosNoFeed: Number(linha.feed_products),
      favorita: linha.favorited_at !== null,
      ultimaVisita: linha.last_visited_at?.toISOString() ?? null,
      ...resumoOuZero(social, linha.slug.toLowerCase()),
    })),
  };
}

/** Os tipos de negócio, na ordem de exibição. */
export async function tiposDeNegocio(): Promise<
  { codigo: string; nome: string; alimentacao: boolean }[]
> {
  const linhas = await transacaoAtual().$queryRaw<
    { code: string; label: string; is_food: boolean }[]
  >`SELECT code, label, is_food FROM app.vertical_presets ORDER BY sort_order, label`;
  return linhas.map((linha) => ({
    codigo: linha.code,
    nome: linha.label,
    alimentacao: linha.is_food,
  }));
}

/** A loja ATIVA do apelido, ou `null` (inexistente, fora do ar, excluída). */
async function lojaAtiva(apelido: string): Promise<string | null> {
  const [linha] = await transacaoAtual().$queryRaw<{ id: string | null }[]>`
    SELECT app.loja_ativa_pelo_apelido(${apelido})::text AS id`;
  return linha?.id ?? null;
}

/** Favorita ou tira dos favoritos. `null` quando a loja não está no ar. */
export async function marcarFavorita(
  apelido: string,
  favorita: boolean,
): Promise<{ apelido: string; favorita: boolean } | null> {
  const lojaId = await lojaAtiva(apelido);
  if (lojaId === null) return null;
  const tx = transacaoAtual();
  if (favorita) {
    await tx.$executeRaw`
      INSERT INTO app.favorite_stores (identity_id, store_id)
      VALUES (app.current_user_id(), ${lojaId}::uuid)
      ON CONFLICT (identity_id, store_id) DO NOTHING`;
  } else {
    await tx.$executeRaw`
      DELETE FROM app.favorite_stores
       WHERE identity_id = app.current_user_id() AND store_id = ${lojaId}::uuid`;
  }
  return { apelido: apelido.toLowerCase(), favorita };
}

/** Registra a visita à loja. `null` quando a loja não está no ar. */
export async function registrarVisita(
  apelido: string,
): Promise<{ apelido: string; visitas: number; ultimaVisita: string } | null> {
  const lojaId = await lojaAtiva(apelido);
  if (lojaId === null) return null;
  const [linha] = await transacaoAtual().$queryRaw<
    { visit_count: number; last_visited_at: Date }[]
  >`
    INSERT INTO app.store_visits (identity_id, store_id)
    VALUES (app.current_user_id(), ${lojaId}::uuid)
    ON CONFLICT (identity_id, store_id) DO UPDATE
       SET last_visited_at = now(),
           visit_count = app.store_visits.visit_count + 1
    RETURNING visit_count, last_visited_at`;
  if (linha === undefined) return null;
  // Recentes têm janela: visita mais velha que a maior janela não serve mais.
  await transacaoAtual().$queryRaw`
    SELECT app.limpar_visitas_antigas(${JANELA_MAXIMA_DOS_RECENTES_EM_DIAS}::integer)`;
  return {
    apelido: apelido.toLowerCase(),
    visitas: Number(linha.visit_count),
    ultimaVisita: linha.last_visited_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Favoritos de produto e recentes com janela (card #45)
// ---------------------------------------------------------------------------

/**
 * Favorita ou tira dos favoritos. Favoritar só vale para produto publicado de
 * loja no ar (`null` nos outros casos); tirar vale sempre.
 */
export async function marcarProdutoFavorito(
  produtoId: string,
  favorito: boolean,
): Promise<{ produtoId: string; favorito: boolean } | null> {
  const tx = transacaoAtual();
  if (!favorito) {
    await tx.$executeRaw`
      DELETE FROM app.favorite_products
       WHERE identity_id = app.current_user_id()
         AND product_id = ${produtoId}::uuid`;
    return { produtoId, favorito };
  }
  const [loja] = await tx.$queryRaw<{ id: string | null }[]>`
    SELECT app.produto_favoritavel(${produtoId}::uuid)::text AS id`;
  if (loja?.id == null) return null;
  await tx.$executeRaw`
    INSERT INTO app.favorite_products (identity_id, store_id, product_id)
    VALUES (app.current_user_id(), ${loja.id}::uuid, ${produtoId}::uuid)
    ON CONFLICT (identity_id, product_id) DO NOTHING`;
  return { produtoId, favorito };
}

interface LinhaDoProdutoFavorito {
  readonly product_id: string;
  readonly name: string;
  readonly price_cents: bigint | null;
  readonly compare_at_cents: bigint | null;
  readonly image_url: string | null;
  readonly available: boolean;
  readonly unavailable_until: Date | null;
  readonly store_slug: string;
  readonly store_name: string;
  readonly store_vertical: string;
  readonly store_logo: string | null;
  readonly store_city: string | null;
  readonly store_neighborhood: string | null;
  readonly store_fulfillment_modes: string[];
  readonly favorited_at: Date;
}

/** Os produtos favoritos da pessoa da sessão, do mais novo para o mais antigo. */
export async function produtosFavoritos(
  limite = 100,
): Promise<ProdutoFavorito[]> {
  const linhas = await transacaoAtual().$queryRaw<LinhaDoProdutoFavorito[]>`
    SELECT * FROM app.produtos_favoritos(${limite}::integer)`;
  return linhas.map((linha) => ({
    id: linha.product_id,
    nome: linha.name,
    precoCentavos: inteiroOuNulo(linha.price_cents),
    precoOriginalCentavos: inteiroOuNulo(linha.compare_at_cents),
    imagem: linha.image_url,
    disponivel: linha.available,
    indisponivelAte: linha.unavailable_until?.toISOString() ?? null,
    loja: {
      apelido: linha.store_slug,
      nome: linha.store_name,
      tipoDeNegocio: linha.store_vertical,
      logo: linha.store_logo,
      fotoDePerfil: linha.store_logo,
      iniciais: iniciaisDaLoja(linha.store_name),
      cidade: linha.store_city,
      bairro: linha.store_neighborhood,
      formasDeEntrega: [...linha.store_fulfillment_modes],
    },
    favoritadoEm: linha.favorited_at.toISOString(),
  }));
}

/**
 * As lojas visitadas nos últimos `dias`, da última visita para trás, até
 * `LIMITE_DOS_RECENTES` (uma por loja: a visita é uma linha só por loja).
 */
export async function lojasRecentes(filtros: {
  readonly dias: number;
  readonly lat?: number | undefined;
  readonly lng?: number | undefined;
}): Promise<{ lojas: LojaDoFeed[]; desde: Date }> {
  const desde = new Date(Date.now() - filtros.dias * 24 * 60 * 60 * 1000);
  // A lista vem ordenada pela última visita: as da janela vêm primeiro.
  const pagina = await lojasDoFeed(
    { lat: filtros.lat, lng: filtros.lng, pagina: 1, porPagina: 50 },
    "RECENTES",
  );
  const lojas = pagina.itens
    .filter(
      (loja) =>
        loja.ultimaVisita !== null && new Date(loja.ultimaVisita) >= desde,
    )
    .slice(0, LIMITE_DOS_RECENTES);
  return { lojas, desde };
}
