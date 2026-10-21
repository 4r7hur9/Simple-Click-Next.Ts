/**
 * Leituras do feed (/explorar, card #37): produtos, lojas, tipos de negócio e
 * as listas da conta (favoritas e recentes).
 *
 * Rodam só no servidor do site. Com sessão, o token do cookie vai no cabeçalho
 * (P-008), e a lista de lojas já chega dizendo quais são favoritas. Nunca
 * lançam: rede fora, resposta fora do contrato e sessão vencida viram estados.
 */
import {
  esquemaDasLojasDoFeed,
  esquemaDosProdutosDoFeed,
  esquemaDosTiposDeNegocioPublicos,
  type LojaDoFeed,
  type ProdutoDoFeed,
} from "@simpleclick/contracts";

import { enderecoDaApi } from "./api-client.ts";

const ESPERA_MAXIMA_EM_MS = 5_000;

export type LeituraDoFeed<T> =
  | { readonly estado: "ok"; readonly dados: T }
  | { readonly estado: "nao-autenticado" }
  | { readonly estado: "indisponivel" };

export interface PaginaDoFeed<T> {
  readonly itens: readonly T[];
  readonly pagina: number;
  readonly porPagina: number;
  readonly total: number;
}

interface Esquema<T> {
  safeParse(
    valor: unknown,
  ): { success: true; data: T } | { success: false };
}

async function ler<T>(
  caminho: string,
  esquema: Esquema<T>,
  token: string | undefined,
  buscar: typeof fetch,
): Promise<LeituraDoFeed<T>> {
  try {
    const resposta = await buscar(`${enderecoDaApi()}${caminho}`, {
      // O feed muda o tempo todo e, com sessão, é da pessoa: nada de cache.
      cache: "no-store",
      signal: AbortSignal.timeout(ESPERA_MAXIMA_EM_MS),
      headers: {
        accept: "application/json",
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
    });
    if (resposta.status === 401) return { estado: "nao-autenticado" };
    if (!resposta.ok) return { estado: "indisponivel" };
    const conferido = esquema.safeParse(await resposta.json());
    return conferido.success
      ? { estado: "ok", dados: conferido.data }
      : { estado: "indisponivel" };
  } catch {
    return { estado: "indisponivel" };
  }
}

/**
 * `GET /v1/feed/produtos?{consulta}`. Com `token`, cada produto diz se a
 * pessoa o favoritou (`favorito`, card #45); sem ele, vem falso.
 */
export async function buscarProdutosDoFeed(
  consulta: string,
  buscar: typeof fetch = fetch,
  token?: string,
): Promise<LeituraDoFeed<PaginaDoFeed<ProdutoDoFeed>>> {
  const lido = await ler(`/v1/feed/produtos?${consulta}`, esquemaDosProdutosDoFeed, token, buscar);
  // Token vencido não tira o feed público da pessoa: tenta sem ele.
  if (lido.estado === "nao-autenticado" && token !== undefined) {
    return buscarProdutosDoFeed(consulta, buscar);
  }
  if (lido.estado !== "ok") return lido;
  const { produtos, pagina, porPagina, total } = lido.dados;
  return { estado: "ok", dados: { itens: produtos, pagina, porPagina, total } };
}

/** `GET /v1/feed/lojas?{consulta}`; com token, traz as favoritas marcadas. */
export async function buscarLojasDoFeed(
  consulta: string,
  token: string | undefined,
  buscar: typeof fetch = fetch,
): Promise<LeituraDoFeed<PaginaDoFeed<LojaDoFeed>>> {
  const lido = await ler(`/v1/feed/lojas?${consulta}`, esquemaDasLojasDoFeed, token, buscar);
  // Token vencido não tira a lista pública da pessoa: tenta sem ele.
  if (lido.estado === "nao-autenticado" && token !== undefined) {
    return buscarLojasDoFeed(consulta, undefined, buscar);
  }
  if (lido.estado !== "ok") return lido;
  const { lojas, pagina, porPagina, total } = lido.dados;
  return { estado: "ok", dados: { itens: lojas, pagina, porPagina, total } };
}

/** `GET /v1/conta/favoritos|recentes`: até 50, a tela filtra o resto. */
export async function buscarLojasDaContaNoFeed(
  quais: "favoritos" | "recentes",
  token: string,
  local: { readonly lat?: number | undefined; readonly lng?: number | undefined },
  buscar: typeof fetch = fetch,
): Promise<LeituraDoFeed<readonly LojaDoFeed[]>> {
  const p = new URLSearchParams({ porPagina: "50" });
  if (local.lat !== undefined && local.lng !== undefined) {
    p.set("lat", String(local.lat));
    p.set("lng", String(local.lng));
  }
  const lido = await ler(`/v1/conta/${quais}?${p.toString()}`, esquemaDasLojasDoFeed, token, buscar);
  return lido.estado === "ok" ? { estado: "ok", dados: lido.dados.lojas } : lido;
}

export interface TipoDeNegocioDoFeed {
  readonly codigo: string;
  readonly nome: string;
  readonly alimentacao: boolean;
}

/** `GET /v1/tipos-de-negocio`: muda quase nunca, fica guardado uma hora. */
export async function buscarTiposDeNegocio(
  buscar: typeof fetch = fetch,
): Promise<readonly TipoDeNegocioDoFeed[]> {
  try {
    const resposta = await buscar(`${enderecoDaApi()}/v1/tipos-de-negocio`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(ESPERA_MAXIMA_EM_MS),
      headers: { accept: "application/json" },
    } as RequestInit);
    if (!resposta.ok) return [];
    const conferido = esquemaDosTiposDeNegocioPublicos.safeParse(await resposta.json());
    return conferido.success ? conferido.data.tipos : [];
  } catch {
    return [];
  }
}
