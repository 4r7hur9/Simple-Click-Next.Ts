/**
 * A loja do painel, descoberta pela sessão (T-115, AC-135, AC-136).
 *
 * O painel não lê loja nenhuma da configuração do servidor. Em cada pedido o
 * site pergunta à API "quem sou eu" (`GET /v1/eu`) com o token de acesso do
 * cookie e escolhe a loja assim:
 *
 * 1. a loja guardada no cookie `sc_loja`, se ela está na lista da sessão;
 * 2. senão, a única loja da sessão;
 * 3. senão, a pessoa escolhe (`/escolher-loja`). Escolha guardada que deixou
 *    de valer também volta para a escolha, para o dono nunca trabalhar numa
 *    loja diferente da que pensa estar.
 *
 * O cookie só guarda a preferência: quem decide o acesso é a API, que confere
 * o vínculo do dono com a loja em toda rota (dívida 92). Por isso um cookie
 * forjado ou esquecido por outra pessoa no mesmo navegador não abre nada.
 */
import {
  esquemaDoEu,
  type EuNoContrato,
  type LojaDaSessao,
} from "@simpleclick/contracts";

import { enderecoDaApi } from "./api-client.ts";
import { lerTokenDeAcessoDoCookie } from "./session-cookie.ts";

/** O cookie que guarda a loja escolhida (só o apelido, nada secreto). */
export const NOME_DO_COOKIE_DA_LOJA = "sc_loja";

/** A escolha dura o mesmo que a renovação da sessão: 30 dias. */
export const DURACAO_DO_COOKIE_DA_LOJA_EM_SEGUNDOS = 30 * 24 * 60 * 60;

/** Onde o dono escolhe a loja. */
export const CAMINHO_DA_ESCOLHA_DE_LOJA = "/escolher-loja";

/** O que o site sabe da loja do painel neste pedido. */
export type LojaDoPainel =
  | {
      readonly estado: "pronta";
      readonly token: string;
      readonly loja: LojaDaSessao;
      readonly lojas: readonly LojaDaSessao[];
    }
  | {
      readonly estado: "escolher";
      readonly token: string;
      readonly lojas: readonly LojaDaSessao[];
      /** Havia uma escolha guardada, e ela não vale mais para esta sessão. */
      readonly escolhaInvalida: boolean;
    }
  | { readonly estado: "sem-loja" }
  | { readonly estado: "sem-sessao" }
  | { readonly estado: "indisponivel" };

/** Lê o apelido guardado no cookie da loja, se houver. */
export function lerCookieDaLoja(cabecalho: string | null): string | undefined {
  if (cabecalho === null) return undefined;
  for (const par of cabecalho.split(";")) {
    const [nome, ...valores] = par.trim().split("=");
    if (nome !== NOME_DO_COOKIE_DA_LOJA || valores.length === 0) continue;
    try {
      const apelido = decodeURIComponent(valores.join("="));
      return apelido === "" ? undefined : apelido;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Pergunta à API quem é a pessoa do token. */
export async function perguntarQuemSouEu(
  token: string,
  buscar: typeof fetch = fetch,
): Promise<EuNoContrato | "sem-sessao" | "indisponivel"> {
  try {
    const resposta = await buscar(`${enderecoDaApi()}/v1/eu`, {
      method: "GET",
      cache: "no-store",
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
    });
    if (resposta.status === 401) return "sem-sessao";
    if (!resposta.ok) return "indisponivel";
    const lido = esquemaDoEu.safeParse(await resposta.json());
    return lido.success ? lido.data : "indisponivel";
  } catch {
    return "indisponivel";
  }
}

/** Decide a loja a partir da resposta da API e da escolha guardada. */
export function decidirLoja(
  token: string,
  eu: EuNoContrato,
  escolhida: string | undefined,
): LojaDoPainel {
  const lojas = eu.lojas;
  if (lojas.length === 0) return { estado: "sem-loja" };
  if (escolhida !== undefined) {
    const loja = lojas.find((l) => l.apelido === escolhida);
    if (loja !== undefined) return { estado: "pronta", token, loja, lojas };
    return { estado: "escolher", token, lojas, escolhaInvalida: true };
  }
  const [unica] = lojas;
  if (lojas.length === 1 && unica !== undefined) {
    return { estado: "pronta", token, loja: unica, lojas };
  }
  return { estado: "escolher", token, lojas, escolhaInvalida: false };
}

/** A loja do painel para o cabeçalho `cookie` recebido. */
export async function lojaDoPainel(
  cabecalhoCookie: string | null,
  buscar: typeof fetch = fetch,
): Promise<LojaDoPainel> {
  const token = lerTokenDeAcessoDoCookie(cabecalhoCookie);
  if (token === undefined) return { estado: "sem-sessao" };
  const eu = await perguntarQuemSouEu(token, buscar);
  if (eu === "sem-sessao") return { estado: "sem-sessao" };
  if (eu === "indisponivel") return { estado: "indisponivel" };
  return decidirLoja(token, eu, lerCookieDaLoja(cabecalhoCookie));
}

/** Resposta curta, sem cache, no formato de erro da API. */
function recusa(status: number, erro: string): Response {
  return Response.json(
    { erro },
    { status, headers: { "cache-control": "no-store" } },
  );
}

/**
 * Para as rotas do site que encaminham à API do dono: o token e o apelido da
 * loja da sessão, ou a resposta pronta quando não há loja para usar.
 */
export async function sessaoParaEncaminhar(
  requisicao: Request,
  buscar: typeof fetch = fetch,
): Promise<{ readonly token: string; readonly apelido: string } | Response> {
  const loja = await lojaDoPainel(requisicao.headers.get("cookie"), buscar);
  switch (loja.estado) {
    case "pronta":
      return { token: loja.token, apelido: loja.loja.apelido };
    case "sem-sessao":
      return recusa(401, "nao_autenticado");
    case "escolher":
      return recusa(409, "loja_nao_escolhida");
    case "sem-loja":
      return recusa(403, "sem_loja");
    case "indisponivel":
      return recusa(503, "indisponivel");
  }
}

/**
 * A loja que a pessoa pode escolher, ou `null` quando o apelido não está entre
 * as lojas da sessão (AC-136): escolher loja alheia não muda nada.
 */
export function lojaEscolhivel(
  decisao: LojaDoPainel,
  apelido: unknown,
): LojaDaSessao | null {
  if (decisao.estado !== "pronta" && decisao.estado !== "escolher") return null;
  if (typeof apelido !== "string") return null;
  return decisao.lojas.find((loja) => loja.apelido === apelido) ?? null;
}
