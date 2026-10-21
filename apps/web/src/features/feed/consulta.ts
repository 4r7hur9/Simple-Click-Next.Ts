/**
 * Os filtros do feed (/explorar) moram no endereço: dá para voltar, compartilhar
 * e recarregar sem perder nada. Este arquivo é a única tradução entre o
 * endereço da página e a consulta da API (card #37) — puro, sem rede.
 *
 * Valor estranho no endereço não quebra a página: vira o padrão.
 */
import {
  ORDENS_DAS_LOJAS_DO_FEED,
  ORDENS_DOS_PRODUTOS_DO_FEED,
} from "@simpleclick/contracts";

export type AbaDoFeed = "produtos" | "lojas";
export type OrdemDoFeed =
  | (typeof ORDENS_DOS_PRODUTOS_DO_FEED)[number]
  | (typeof ORDENS_DAS_LOJAS_DO_FEED)[number];
export type EntregaDoFeed = "entrega" | "retirada";
/** Só na aba de lojas: todas, as favoritas ou as vistas há pouco. */
export type ListaDeLojas = "todas" | "favoritas" | "recentes";

export interface ConsultaDoFeed {
  readonly aba: AbaDoFeed;
  /** Códigos de tipo de negócio, separados por vírgula (`FOOD_SNACK,FOOD_ACAI`). */
  readonly tipo?: string | undefined;
  /** Categoria do produto (só produtos). */
  readonly categoria?: string | undefined;
  readonly entrega?: EntregaDoFeed | undefined;
  readonly busca?: string | undefined;
  readonly ordem: OrdemDoFeed;
  readonly lat?: number | undefined;
  readonly lng?: number | undefined;
  readonly pagina: number;
  readonly lista: ListaDeLojas;
  /** Só produtos com preço de atacado (`?atacado=1`, só produtos; card #59). */
  readonly atacado?: boolean | undefined;
}

/** Quantos cartões por página. */
export const POR_PAGINA = 24;

/** Os parâmetros como o Next entrega em `searchParams`. */
export type ParametrosDaPagina = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

function primeiro(valor: string | readonly string[] | undefined): string | undefined {
  const texto = typeof valor === "string" ? valor : valor?.[0];
  const limpo = texto?.trim() ?? "";
  return limpo === "" ? undefined : limpo;
}

function numeroEntre(texto: string | undefined, min: number, max: number) {
  if (texto === undefined) return undefined;
  const numero = Number(texto);
  return Number.isFinite(numero) && numero >= min && numero <= max
    ? numero
    : undefined;
}

const TIPOS_VALIDOS = /^[A-Za-z_]{2,40}(,[A-Za-z_]{2,40}){0,9}$/;

/** As ordens que cada aba aceita. */
export function ordensDaAba(aba: AbaDoFeed): readonly OrdemDoFeed[] {
  return aba === "produtos"
    ? ORDENS_DOS_PRODUTOS_DO_FEED
    : ORDENS_DAS_LOJAS_DO_FEED;
}

export const NOME_DA_ORDEM: Readonly<Record<OrdemDoFeed, string>> = {
  relevancia: "Relevância",
  distancia: "Mais perto",
  "preco-menor": "Menor preço",
  "preco-maior": "Maior preço",
  recentes: "Mais recentes",
  nome: "Nome (A a Z)",
};

/** Lê o endereço da página; o que não vale vira o padrão. */
export function lerConsulta(
  aba: AbaDoFeed,
  parametros: ParametrosDaPagina,
): ConsultaDoFeed {
  const tipo = primeiro(parametros["tipo"]);
  const entrega = primeiro(parametros["entrega"]);
  const ordem = primeiro(parametros["ordem"]);
  const lista = primeiro(parametros["lista"]);
  const lat = numeroEntre(primeiro(parametros["lat"]), -90, 90);
  const lng = numeroEntre(primeiro(parametros["lng"]), -180, 180);
  const comLocal = lat !== undefined && lng !== undefined;
  const pagina = numeroEntre(primeiro(parametros["pagina"]), 1, 1000);
  return {
    aba,
    tipo: tipo !== undefined && TIPOS_VALIDOS.test(tipo) ? tipo.toUpperCase() : undefined,
    categoria:
      aba === "produtos" ? primeiro(parametros["categoria"])?.slice(0, 80) : undefined,
    entrega: entrega === "entrega" || entrega === "retirada" ? entrega : undefined,
    busca: primeiro(parametros["busca"])?.slice(0, 80),
    ordem: ordensDaAba(aba).includes(ordem as OrdemDoFeed)
      ? (ordem as OrdemDoFeed)
      : "relevancia",
    lat: comLocal ? lat : undefined,
    lng: comLocal ? lng : undefined,
    pagina: pagina === undefined ? 1 : Math.floor(pagina),
    lista:
      aba === "lojas" && (lista === "favoritas" || lista === "recentes")
        ? lista
        : "todas",
    atacado: aba === "produtos" && atacadoNoEndereco(primeiro(parametros["atacado"])),
  };
}

function atacadoNoEndereco(valor: string | undefined): boolean {
  return valor === "1" || valor === "true";
}

/** A consulta tem a localização da pessoa. */
export function temLocal(consulta: ConsultaDoFeed): boolean {
  return consulta.lat !== undefined && consulta.lng !== undefined;
}

/**
 * A ordem que vai de fato para a API: "mais perto" sem localização não tem
 * como ordenar, e cai para relevância (a tela avisa).
 */
export function ordemEfetiva(consulta: ConsultaDoFeed): OrdemDoFeed {
  return consulta.ordem === "distancia" && !temLocal(consulta)
    ? "relevancia"
    : consulta.ordem;
}

/** A consulta da API (`?tipo=…&ordem=…`), sem o `?`. */
export function consultaDaApi(consulta: ConsultaDoFeed): string {
  const p = new URLSearchParams();
  if (consulta.tipo) p.set("tipo", consulta.tipo);
  if (consulta.categoria) p.set("categoria", consulta.categoria);
  if (consulta.entrega) p.set("entrega", consulta.entrega);
  if (consulta.busca) p.set("busca", consulta.busca);
  if (consulta.aba === "produtos" && consulta.atacado) p.set("atacado", "1");
  p.set("ordem", ordemEfetiva(consulta));
  if (temLocal(consulta)) {
    p.set("lat", String(consulta.lat));
    p.set("lng", String(consulta.lng));
  }
  p.set("pagina", String(consulta.pagina));
  p.set("porPagina", String(POR_PAGINA));
  return p.toString();
}

/**
 * O endereço da página com uma mudança. Mudar qualquer filtro volta para a
 * página 1 (a 3 de outro filtro não existe); só a própria paginação mantém.
 */
export function enderecoDoFeed(
  consulta: ConsultaDoFeed,
  mudancas: Partial<Omit<ConsultaDoFeed, "aba">> & { readonly aba?: AbaDoFeed } = {},
): string {
  const aba = mudancas.aba ?? consulta.aba;
  const nova: ConsultaDoFeed = {
    ...consulta,
    pagina: 1,
    ...mudancas,
    aba,
  };
  const p = new URLSearchParams();
  if (nova.tipo) p.set("tipo", nova.tipo);
  if (aba === "produtos" && nova.categoria) p.set("categoria", nova.categoria);
  if (nova.entrega) p.set("entrega", nova.entrega);
  if (nova.busca) p.set("busca", nova.busca);
  if (aba === "produtos" && nova.atacado) p.set("atacado", "1");
  if (nova.ordem !== "relevancia" && ordensDaAba(aba).includes(nova.ordem)) {
    p.set("ordem", nova.ordem);
  }
  if (temLocal(nova)) {
    p.set("lat", String(nova.lat));
    p.set("lng", String(nova.lng));
  }
  if (aba === "lojas" && nova.lista !== "todas") p.set("lista", nova.lista);
  if (nova.pagina > 1) p.set("pagina", String(nova.pagina));
  const texto = p.toString();
  return `/explorar/${aba}${texto === "" ? "" : `?${texto}`}`;
}

/** Quantas páginas cabem no total. */
export function totalDePaginas(total: number, porPagina: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, porPagina)));
}

/** Localização arredondada (~100 m): basta para ordenar e protege a pessoa. */
export function arredondarLocal(valor: number): number {
  return Math.round(valor * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Categorias por tipo de negócio
// ---------------------------------------------------------------------------

export interface TipoDeNegocio {
  readonly codigo: string;
  readonly nome: string;
  readonly alimentacao: boolean;
}

export interface CategoriaDoFeed {
  readonly rotulo: string;
  /** Vazio = todas. */
  readonly tipo: string | undefined;
}

/**
 * As pílulas do topo: "Tudo", "Comida" (todos os ramos de alimentação juntos,
 * quando há mais de um) e cada tipo de negócio.
 */
export function categoriasDoFeed(
  tipos: readonly TipoDeNegocio[],
): readonly CategoriaDoFeed[] {
  const comida = tipos.filter((t) => t.alimentacao).map((t) => t.codigo);
  return [
    { rotulo: "Tudo", tipo: undefined },
    ...(comida.length > 1 ? [{ rotulo: "Comida", tipo: comida.join(",") }] : []),
    ...tipos.map((t) => ({ rotulo: t.nome, tipo: t.codigo })),
  ];
}

/** Lojas de favoritos/recentes vêm sem filtro da API: o site filtra aqui. */
export function filtrarLojasDaConta<
  L extends {
    readonly nome: string;
    readonly tipoDeNegocio: string;
    readonly tipoDeNegocioNome: string;
    readonly bairro: string | null;
    readonly cidade: string | null;
    readonly formasDeEntrega: readonly string[];
  },
>(lojas: readonly L[], consulta: ConsultaDoFeed): readonly L[] {
  const tipos = consulta.tipo?.split(",") ?? [];
  const forma =
    consulta.entrega === "entrega"
      ? "DELIVERY"
      : consulta.entrega === "retirada"
        ? "PICKUP"
        : undefined;
  const busca = semAcento(consulta.busca ?? "");
  return lojas.filter(
    (l) =>
      (tipos.length === 0 || tipos.includes(l.tipoDeNegocio)) &&
      (forma === undefined || l.formasDeEntrega.includes(forma)) &&
      (busca === "" ||
        semAcento(
          [l.nome, l.tipoDeNegocioNome, l.bairro ?? "", l.cidade ?? ""].join(" "),
        ).includes(busca)),
  );
}

function semAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** "6,4 km" ou "800 m". */
export function escreverDistancia(km: number | null): string | null {
  if (km === null) return null;
  if (km < 1) return `${Math.max(100, Math.round((km * 1000) / 100) * 100)} m`;
  return `${km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}

/** "Entrega e retirada", "Só entrega", "Só retirada". */
export function escreverFormas(formas: readonly string[]): string | null {
  const entrega = formas.includes("DELIVERY");
  const retirada = formas.includes("PICKUP");
  if (entrega && retirada) return "Entrega e retirada";
  if (entrega) return "Entrega";
  if (retirada) return "Retirada";
  return null;
}
