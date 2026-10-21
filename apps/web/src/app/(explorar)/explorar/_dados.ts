/**
 * O que as duas abas do feed buscam no servidor (card #37): a sessão (para os
 * favoritos), os tipos de negócio e o conteúdo da aba.
 */
import { cookies } from "next/headers";

import {
  consultaDaApi,
  filtrarLojasDaConta,
  type ConsultaDoFeed,
} from "../../../features/feed/consulta.ts";
import type { ConteudoDoFeed } from "../../../features/feed/TelaDoFeed.tsx";
import { lerStories, type LojaComStories } from "../../../features/feed/social.ts";
import { buscarStoriesDoFeed } from "../../../server/feed-social.ts";
import {
  buscarLojasDaContaNoFeed,
  buscarLojasDoFeed,
  buscarProdutosDoFeed,
} from "../../../server/feed.ts";
import { NOME_DO_COOKIE_DE_ACESSO } from "../../../server/session-cookie.ts";

export async function tokenDaSessao(): Promise<string | undefined> {
  const token = (await cookies()).get(NOME_DO_COOKIE_DE_ACESSO)?.value;
  return token === undefined || token === "" ? undefined : token;
}

export async function conteudoDosProdutos(
  consulta: ConsultaDoFeed,
): Promise<ConteudoDoFeed> {
  const lido = await buscarProdutosDoFeed(consultaDaApi(consulta));
  if (lido.estado !== "ok") return { estado: "indisponivel" };
  return {
    estado: "produtos",
    itens: lido.dados.itens,
    total: lido.dados.total,
    porPagina: lido.dados.porPagina,
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
export async function storiesDoFeed(
  token: string | undefined,
): Promise<readonly LojaComStories[]> {
  return lerStories(await buscarStoriesDoFeed(token));
}

/** Card #49: quem a pessoa segue (as lojas favoritas), para a pílula "Favorito" do post. */
export async function lojasSeguidas(token: string | undefined): Promise<readonly string[]> {
  if (token === undefined) return [];
  const lido = await buscarLojasDaContaNoFeed("favoritos", token, {});
  return lido.estado === "ok" ? lido.dados.map((l) => l.apelido) : [];
}
