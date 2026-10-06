/**
 * A chamada do servidor do site às rotas de `/v1/auth` da API (T-113).
 *
 * Um lugar só monta os cabeçalhos: origem do site (a API confere a lista
 * fechada antes de toda escrita), tipo de cliente "navegador" e, quando há,
 * o cookie de renovação e o Bearer de acesso. A resposta volta crua, para
 * quem chamou decidir o que repassar à página — nunca token nem Set-Cookie
 * da API sem filtro.
 */
import { enderecoDaApi } from "./api-client.ts";

/** O que a chamada leva além do corpo. */
export interface ExtrasDaChamada {
  /** Token de renovação, enviado como o cookie `sc_refresh` da API. */
  readonly tokenDeRenovacao?: string | undefined;
  /** Token de acesso, enviado como Bearer. */
  readonly tokenDeAcesso?: string | undefined;
}

/** Resposta da API já lida: status, corpo JSON e os Set-Cookie dela. */
export interface RespostaDaIdentidade {
  readonly status: number;
  readonly corpo: Record<string, unknown>;
  readonly setCookies: readonly string[];
}

/** Os cabeçalhos que a API espera do site. */
export function cabecalhosParaApi(
  requisicao: Request,
  extras: ExtrasDaChamada = {},
): Headers {
  const cabecalhos = new Headers({
    accept: "application/json",
    "content-type": "application/json",
    origin: requisicao.headers.get("origin") ?? new URL(requisicao.url).origin,
    "x-simpleclick-client": "navegador",
  });
  if (extras.tokenDeRenovacao !== undefined) {
    cabecalhos.set(
      "cookie",
      `sc_refresh=${encodeURIComponent(extras.tokenDeRenovacao)}`,
    );
  }
  if (extras.tokenDeAcesso !== undefined) {
    cabecalhos.set("authorization", `Bearer ${extras.tokenDeAcesso}`);
  }
  return cabecalhos;
}

/** Os Set-Cookie de uma resposta, um por linha. */
function setCookiesDa(resposta: Response): string[] {
  const cabecalhos = resposta.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const linhas = cabecalhos.getSetCookie?.();
  if (linhas !== undefined) return linhas;
  const junto = resposta.headers.get("set-cookie");
  return junto === null ? [] : junto.split(/\r?\n/);
}

/** O valor de um cookie numa lista de Set-Cookie. */
export function valorDoSetCookie(
  linhas: readonly string[],
  nome: string,
): string | undefined {
  for (const linha of linhas) {
    const par = linha.split(";")[0] ?? "";
    const separador = par.indexOf("=");
    if (separador < 1 || par.slice(0, separador).trim() !== nome) continue;
    const valor = par.slice(separador + 1);
    try {
      return valor === "" ? undefined : decodeURIComponent(valor);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Chama `POST /v1/auth<caminho>`. Lança só quando a API não respondeu (rede
 * fora); resposta de erro volta como resposta, para quem chamou traduzir.
 */
export async function chamarIdentidade(
  caminho: string,
  requisicao: Request,
  corpo: unknown,
  opcoes: {
    readonly extras?: ExtrasDaChamada;
    readonly buscar?: typeof fetch;
  } = {},
): Promise<RespostaDaIdentidade> {
  const pedido: RequestInit = {
    method: "POST",
    headers: cabecalhosParaApi(requisicao, opcoes.extras),
    cache: "no-store",
  };
  if (corpo !== undefined) pedido.body = JSON.stringify(corpo);
  const buscar = opcoes.buscar ?? fetch;
  const resposta = await buscar(`${enderecoDaApi()}/v1/auth${caminho}`, pedido);
  let lido: unknown;
  try {
    lido = await resposta.json();
  } catch {
    lido = {};
  }
  return {
    status: resposta.status,
    corpo:
      typeof lido === "object" && lido !== null
        ? (lido as Record<string, unknown>)
        : {},
    setCookies: setCookiesDa(resposta),
  };
}
