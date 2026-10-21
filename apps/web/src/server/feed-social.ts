/**
 * O lado social do /explorar (card #49): stories das lojas, curtir, comentar e
 * favoritar produto. Roda só no servidor do site, com o token do cookie.
 *
 * Os caminhos da API estão TODOS aqui (`CAMINHOS_SOCIAIS`). Stories seguem o
 * contrato do #46 (contracts/stories.ts); curtidas, comentários e favorito de
 * produto (#47/#45) ainda podem ajustar o caminho, e aí só este arquivo muda.
 * Endpoint que ainda não existe responde 404, que vira "indisponivel": a tela
 * esconde o recurso ou avisa, em vez de quebrar.
 */
import { headers } from "next/headers";

import { enderecoDaApi } from "./api-client.ts";
import { enderecoDoSite } from "./endereco-do-site.ts";

const ESPERA_MAXIMA_EM_MS = 5_000;

export const CAMINHOS_SOCIAIS = {
  stories: "/v1/stories",
  storyVisto: (storyId: string) =>
    `/v1/stories/${encodeURIComponent(storyId)}/visto`,
  curtidaDaLoja: (apelido: string) =>
    `/v1/feed/lojas/${encodeURIComponent(apelido)}/curtida`,
  curtida: (produtoId: string) =>
    `/v1/feed/produtos/${encodeURIComponent(produtoId)}/curtida`,
  comentarios: (produtoId: string) =>
    `/v1/feed/produtos/${encodeURIComponent(produtoId)}/comentarios`,
  favoritoDeProduto: (produtoId: string) =>
    `/v1/conta/favoritos/produtos/${encodeURIComponent(produtoId)}`,
} as const;

/**
 * A origem que a API aceita: a da própria requisição (host e protocolo que o
 * navegador usou), e só na falta dela o endereço configurado do site. Sem
 * isso, no desenvolvimento (sem URL_DO_SITE) a origem caía no endereço padrão
 * de produção local, que a API não lista, e curtir virava "indisponível".
 */
async function origemDoSite(): Promise<string> {
  try {
    const cabecalhos = await headers();
    const origem = cabecalhos.get("origin");
    if (origem !== null && origem !== "null") return origem;
    const host = cabecalhos.get("x-forwarded-host") ?? cabecalhos.get("host");
    if (host !== null) {
      const protocolo =
        cabecalhos.get("x-forwarded-proto") ??
        (host.startsWith("localhost") ? "http" : "https");
      return `${protocolo}://${host}`;
    }
  } catch {
    // Fora de uma requisição (testes): cai no endereço configurado.
  }
  return new URL(enderecoDoSite()).origin;
}

export type RespostaSocial =
  | { readonly estado: "ok"; readonly corpo: unknown }
  | { readonly estado: "nao-autenticado" }
  | { readonly estado: "recusado"; readonly mensagem?: string }
  | { readonly estado: "indisponivel" };

export async function chamarApiSocial(
  caminho: string,
  {
    metodo = "GET",
    token,
    corpo,
    buscar = fetch,
  }: {
    readonly metodo?: "GET" | "POST" | "DELETE";
    readonly token?: string | undefined;
    readonly corpo?: unknown;
    readonly buscar?: typeof fetch;
  } = {},
): Promise<RespostaSocial> {
  try {
    const resposta = await buscar(`${enderecoDaApi()}${caminho}`, {
      method: metodo,
      cache: "no-store",
      signal: AbortSignal.timeout(ESPERA_MAXIMA_EM_MS),
      headers: {
        accept: "application/json",
        // A API recusa escrita sem a origem do site (proteção contra CSRF):
        // curtir, comentar e favoritar chegavam como 403 e viravam "indisponível".
        ...(metodo === "GET" ? {} : { origin: await origemDoSite() }),
        ...(corpo === undefined ? {} : { "content-type": "application/json" }),
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    });
    if (resposta.status === 401) return { estado: "nao-autenticado" };
    if (
      resposta.status === 400 ||
      resposta.status === 422 ||
      resposta.status === 409
    ) {
      const erro = (await resposta.json().catch(() => null)) as {
        mensagem?: unknown;
      } | null;
      return typeof erro?.mensagem === "string"
        ? { estado: "recusado", mensagem: erro.mensagem }
        : { estado: "recusado" };
    }
    if (!resposta.ok) return { estado: "indisponivel" };
    if (resposta.status === 204) return { estado: "ok", corpo: null };
    return { estado: "ok", corpo: await resposta.json().catch(() => null) };
  } catch {
    return { estado: "indisponivel" };
  }
}

/** `GET /v1/stories`: as lojas com story no ar (com token, vistos e favoritas). */
export async function buscarStoriesDoFeed(
  token: string | undefined,
  buscar: typeof fetch = fetch,
): Promise<unknown> {
  const lido = await chamarApiSocial(CAMINHOS_SOCIAIS.stories, {
    token,
    buscar,
  });
  if (lido.estado === "nao-autenticado" && token !== undefined) {
    return buscarStoriesDoFeed(undefined, buscar);
  }
  return lido.estado === "ok" ? lido.corpo : null;
}
