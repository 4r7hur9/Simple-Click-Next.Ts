/**
 * O que as duas abas do feed buscam no servidor (card #37): a sessão (para os
 * favoritos), os tipos de negócio e o conteúdo da aba.
 */
import { cookies } from "next/headers";
import { cache } from "react";
import type { LojaDoFeed, ProdutoDoFeed } from "@simpleclick/contracts";

import {
  consultaDaApi,
  filtrarLojasDaConta,
  ordensDaAba,
  type ConsultaDoFeed,
} from "../../../features/feed/consulta.ts";
import type { ConteudoDoFeed } from "../../../features/feed/TelaDoFeed.tsx";
import { lerStories, type LojaComStories } from "../../../features/feed/social.ts";
import { lerStoriesDoFeed } from "../../../server/feed-social.ts";
import {
  buscarLojasDaContaNoFeed,
  buscarLojasDoFeed,
  buscarProdutosDoFeed,
  type LeituraDoFeed,
} from "../../../server/feed.ts";
import { NOME_DO_COOKIE_DE_ACESSO } from "../../../server/session-cookie.ts";

export async function tokenDaSessao(): Promise<string | undefined> {
  const token = (await cookies()).get(NOME_DO_COOKIE_DE_ACESSO)?.value;
  return token === undefined || token === "" ? undefined : token;
}

/**
 * Os produtos do feed. O token vem SEMPRE do servidor (`tokenDaSessao`) e
 * nunca do navegador: com ele cada produto diz se a pessoa o favoritou, em
 * todas as páginas (AC-10613). Com sessão vencida a lista pública vem
 * marcada (`sessaoVencida`), e a tela não finge que não há favoritos.
 */
export async function conteudoDosProdutos(
  consulta: ConsultaDoFeed,
  token?: string,
): Promise<ConteudoDoFeed> {
  const lido = await buscarProdutosDoFeed(consultaDaApi(consulta), fetch, token);
  if (lido.estado !== "ok") return { estado: "indisponivel" };
  return {
    estado: "produtos",
    itens: lido.dados.itens,
    total: lido.dados.total,
    porPagina: lido.dados.porPagina,
    ...(lido.sessaoVencida === true ? { sessaoVencida: true as const } : {}),
  };
}

export async function conteudoDasLojas(
  consulta: ConsultaDoFeed,
  token: string | undefined,
): Promise<ConteudoDoFeed> {
  if (consulta.lista !== "todas") {
    if (token === undefined) return { estado: "precisa-entrar" };
    const lido = await buscarLojasDaContaNoFeed(
      consulta.lista === "favoritas" ? "favoritos" : "recentes",
      token,
      consulta,
    );
    if (lido.estado === "nao-autenticado") return { estado: "precisa-entrar" };
    if (lido.estado !== "ok") return { estado: "indisponivel" };
    const itens = filtrarLojasDaConta(lido.dados, consulta);
    return { estado: "lojas", itens, total: itens.length, porPagina: Math.max(1, itens.length) };
  }
  const lido = await buscarLojasDoFeed(consultaDaApi(consulta), token);
  if (lido.estado !== "ok") return { estado: "indisponivel" };
  return {
    estado: "lojas",
    itens: lido.dados.itens,
    total: lido.dados.total,
    porPagina: lido.dados.porPagina,
  };
}

/** Card #49: as lojas com story no ar; sem a API ainda, nenhuma. */
export async function storiesDoFeed(token: string | undefined): Promise<{
  readonly lojas: readonly LojaComStories[];
  readonly sessaoVencida: boolean;
}> {
  const lido = await lerStoriesDoFeed(token);
  return { lojas: lerStories(lido.corpo), sessaoVencida: lido.sessaoVencida };
}

/**
 * As lojas favoritas e as vistas há pouco da conta. `cache()` do React guarda
 * o resultado SÓ durante a requisição (nunca entre pessoas): a pílula
 * "Favorito" do post e a seção "Suas lojas" leem a mesma resposta. Só
 * argumentos simples, para a chave bater.
 */
export const lojasDaConta = cache(
  async (
    quais: "favoritos" | "recentes",
    token: string,
    lat?: number,
    lng?: number,
  ): Promise<LeituraDoFeed<readonly LojaDoFeed[]>> =>
    buscarLojasDaContaNoFeed(quais, token, { lat, lng }),
);

/**
 * Card #49: quem a pessoa segue (as lojas favoritas), para a pílula
 * "Favorito" do post. Sessão vencida não vira "não segue ninguém" em silêncio.
 */
export async function seguidasDaConta(token: string | undefined): Promise<{
  readonly apelidos: readonly string[];
  readonly sessaoVencida: boolean;
}> {
  if (token === undefined) return { apelidos: [], sessaoVencida: false };
  const lido = await lojasDaConta("favoritos", token);
  if (lido.estado === "ok") {
    return { apelidos: lido.dados.map((l) => l.apelido), sessaoVencida: false };
  }
  return { apelidos: [], sessaoVencida: lido.estado === "nao-autenticado" };
}

/** Só os apelidos (a vitrine da loja usa assim); veja `seguidasDaConta`. */
export async function lojasSeguidas(token: string | undefined): Promise<readonly string[]> {
  return (await seguidasDaConta(token)).apelidos;
}

/**
 * Cada seção do início lê e falha sozinha (AC-10605): a leitura que lança ou
 * estoura vira o valor de reserva, e as outras seções seguem normais.
 */
export async function ouReserva<T>(leitura: Promise<T>, reserva: T): Promise<T> {
  try {
    return await leitura;
  } catch {
    return reserva;
  }
}

/** O que a seção "Suas lojas" mostra (card #106, T-10604). */
export type DadosDeSuasLojas =
  | { readonly estado: "visitante" }
  | { readonly estado: "sessao-vencida" }
  | { readonly estado: "indisponivel" }
  | { readonly estado: "ok"; readonly lojas: readonly LojaDoFeed[] };

export const LOJAS_NA_SECAO = 6;

/**
 * As favoritas e, depois, as vistas há pouco da PRÓPRIA conta (a janela de 30
 * dias e o limite de 20 são da API). O visitante nunca dispara `/v1/conta/*`
 * (AC-10612); sessão vencida não vira "sem lojas" em silêncio (AC-10614).
 */
export async function dadosDeSuasLojas(
  token: string | undefined,
): Promise<DadosDeSuasLojas> {
  if (token === undefined) return { estado: "visitante" };
  const [favoritas, recentes] = await Promise.all([
    lojasDaConta("favoritos", token),
    lojasDaConta("recentes", token),
  ]);
  if (
    favoritas.estado === "nao-autenticado" ||
    recentes.estado === "nao-autenticado" ||
    (favoritas.estado === "ok" && favoritas.sessaoVencida === true) ||
    (recentes.estado === "ok" && recentes.sessaoVencida === true)
  ) {
    return { estado: "sessao-vencida" };
  }
  if (favoritas.estado !== "ok" && recentes.estado !== "ok") {
    return { estado: "indisponivel" };
  }
  const vistas = new Set<string>();
  const lojas: LojaDoFeed[] = [];
  for (const lista of [favoritas, recentes]) {
    if (lista.estado !== "ok") continue;
    for (const loja of lista.dados) {
      if (vistas.has(loja.apelido)) continue;
      vistas.add(loja.apelido);
      lojas.push(loja);
    }
  }
  return { estado: "ok", lojas: lojas.slice(0, LOJAS_NA_SECAO) };
}

export type AbaDeDestaques = "recentes" | "atacado";
export const PRODUTOS_NOS_DESTAQUES = 8;

export function abaDeDestaques(valor: string | readonly string[] | undefined): AbaDeDestaques {
  return (typeof valor === "string" ? valor : valor?.[0]) === "atacado"
    ? "atacado"
    : "recentes";
}

/** Destaques e ofertas: só ordenações e filtros que a API já tem (AC-10621). */
export async function destaquesDoInicio(
  consulta: ConsultaDoFeed,
  aba: AbaDeDestaques,
  token: string | undefined,
): Promise<LeituraDoFeed<readonly ProdutoDoFeed[]>> {
  const p = new URLSearchParams(
    consultaDaApi({
      ...consulta,
      busca: undefined,
      categoria: undefined,
      ordem: "recentes",
      pagina: 1,
      atacado: aba === "atacado",
    }),
  );
  p.set("porPagina", String(PRODUTOS_NOS_DESTAQUES));
  const lido = await buscarProdutosDoFeed(p.toString(), fetch, token);
  if (lido.estado !== "ok") return lido;
  return { ...lido, dados: lido.dados.itens };
}

/**
 * Lojas para conhecer (card #128): quando a pessoa não tem conta, a sessão
 * venceu ou ainda não marcou nenhuma loja, a seção de lojas do início mostra
 * as lojas públicas do feed, com os mesmos filtros e a mesma ordem da página.
 * Nada de "destaque" escolhido à mão (Q-10603 segue aberta).
 */
export async function lojasParaConhecer(
  consulta: ConsultaDoFeed,
  token: string | undefined,
): Promise<readonly LojaDoFeed[]> {
  const p = new URLSearchParams(
    consultaDaApi({
      ...consulta,
      aba: "lojas",
      busca: undefined,
      categoria: undefined,
      atacado: false,
      ordem: ordensDaAba("lojas").includes(consulta.ordem) ? consulta.ordem : "relevancia",
      pagina: 1,
    }),
  );
  p.set("porPagina", String(LOJAS_NA_SECAO));
  const lido = await buscarLojasDoFeed(p.toString(), token);
  return lido.estado === "ok" ? lido.dados.itens.slice(0, LOJAS_NA_SECAO) : [];
}
