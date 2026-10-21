/**
 * A chamada do servidor do site às rotas de `/v1/auth` da API (T-113).
 *
 * Um lugar só monta os cabeçalhos: origem do site (a API confere a lista
 * fechada antes de toda escrita), tipo de cliente "navegador", o endereço do
 * visitante com a prova da ponte (AC-120) e, quando há, o cookie de
 * renovação e o Bearer de acesso. A resposta volta crua, para quem chamou
 * decidir o que repassar à página — nunca token nem Set-Cookie da API sem
 * filtro.
 */
import {
  CABECALHO_DA_PONTE,
  CABECALHO_DO_AGENTE_DO_VISITANTE,
  CABECALHO_DO_ENDERECO_DO_VISITANTE,
  TAMANHO_MINIMO_DO_SEGREDO_DA_PONTE,
} from "@simpleclick/contracts";

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

/**
 * O endereço do visitante como a borda na frente do site o viu: o ÚLTIMO item
 * de `X-Forwarded-For` (o que a borda acrescentou; o começo da lista quem
 * chama escreve à vontade), ou `X-Real-IP`. `undefined` sem borda nenhuma.
 */
export function enderecoDoVisitante(requisicao: Request): string | undefined {
  const lista = (requisicao.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
  const endereco = lista.at(-1) ?? requisicao.headers.get("x-real-ip")?.trim();
  return endereco === undefined || endereco === "" ? undefined : endereco;
}

/**
 * A prova da ponte e o que a API não enxerga sozinha: o endereço e o
 * navegador do visitante (o aceite dos termos grava os dois, card #79).
 *
 * AC-120: sem isto a API veria só o endereço do site, e todo visitante
 * dividiria o mesmo balde do limite de tentativas. A API só acredita no
 * que vem com o segredo da ponte, que nunca vai ao navegador.
 */
export function cabecalhosDaPonte(
  requisicao: Request,
  fonte: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, string> {
  const segredo = fonte["SEGREDO_DA_PONTE"]?.trim() ?? "";
  const visitante = enderecoDoVisitante(requisicao);
  if (
    segredo.length < TAMANHO_MINIMO_DO_SEGREDO_DA_PONTE ||
    visitante === undefined
  ) {
    return {};
  }
  const agente = requisicao.headers.get("user-agent")?.trim();
  return {
    [CABECALHO_DA_PONTE]: segredo,
    [CABECALHO_DO_ENDERECO_DO_VISITANTE]: visitante,
    ...(agente === undefined || agente === ""
      ? {}
      : { [CABECALHO_DO_AGENTE_DO_VISITANTE]: agente.slice(0, 300) }),
  };
}

/** Os cabeçalhos que a API espera do site. */
export function cabecalhosParaApi(
  requisicao: Request,
  extras: ExtrasDaChamada = {},
  fonte: Readonly<Record<string, string | undefined>> = process.env,
): Headers {
  const cabecalhos = new Headers({
    accept: "application/json",
    "content-type": "application/json",
    origin: requisicao.headers.get("origin") ?? new URL(requisicao.url).origin,
    "x-simpleclick-client": "navegador",
  });
  for (const [nome, valor] of Object.entries(cabecalhosDaPonte(requisicao, fonte))) {
    cabecalhos.set(nome, valor);
  }
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
