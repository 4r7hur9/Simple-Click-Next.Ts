/**
 * Ponte de sessão entre o navegador e a API (AC-109, AC-111).
 *
 * A API devolve o par a esta camada de servidor. Para a web, só o refresh vira
 * cookie httpOnly e a resposta pública nunca contém token. O cliente nativo
 * não passa por aqui: ele chama a mesma API com o tipo `nativo` e recebe o par
 * no corpo, conforme o contrato do caso de uso da API.
 */

import { enderecoDaApi } from "./api-client";
import {
  adicionarCookieDeRenovacao,
  lerTokenDeRenovacaoDoCookie,
} from "./session-cookie";

export const ACOES_DE_SESSAO = ["login", "renovar"] as const;

export type AcaoDeSessao = (typeof ACOES_DE_SESSAO)[number];

export interface SessaoRecebidaDaApi {
  readonly tokenDeAcesso: string;
  readonly tokenDeRenovacao: string;
  readonly acessoExpiraEm: string;
}

interface CorpoSeguroDaSessao {
  readonly autenticado: true;
  readonly acessoExpiraEm: string;
}

/** Só aceita ações conhecidas; caminho livre aqui viraria proxy aberto. */
export function ehAcaoDeSessao(acao: string): acao is AcaoDeSessao {
  return (ACOES_DE_SESSAO as readonly string[]).includes(acao);
}

function caminhoDaApi(acao: AcaoDeSessao): string {
  return acao === "login" ? "/v1/auth/login" : "/v1/auth/renovar";
}

function respostaJson(
  status: number,
  corpo: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function sessaoRecebida(valor: unknown): SessaoRecebidaDaApi | undefined {
  if (typeof valor !== "object" || valor === null) return undefined;
  const sessao = valor as Partial<SessaoRecebidaDaApi>;
  if (
    typeof sessao.tokenDeAcesso !== "string" ||
    sessao.tokenDeAcesso === "" ||
    typeof sessao.tokenDeRenovacao !== "string" ||
    sessao.tokenDeRenovacao === "" ||
    typeof sessao.acessoExpiraEm !== "string" ||
    Number.isNaN(Date.parse(sessao.acessoExpiraEm))
  ) {
    return undefined;
  }
  return sessao as SessaoRecebidaDaApi;
}

/**
 * Converte os tokens que só o servidor recebeu em uma resposta segura para a
 * página. O corpo não entrega access token nem refresh token a JavaScript.
 */
export function responderSessaoDoNavegador(
  sessao: SessaoRecebidaDaApi,
  fonte: Readonly<Record<string, string | undefined>> = process.env,
): Response {
  const corpo: CorpoSeguroDaSessao = {
    autenticado: true,
    acessoExpiraEm: sessao.acessoExpiraEm,
  };
  const cabecalhos = new Headers({
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  adicionarCookieDeRenovacao(cabecalhos, sessao.tokenDeRenovacao, fonte);

  return new Response(JSON.stringify(corpo), {
    status: 200,
    headers: cabecalhos,
  });
}

function cabecalhosParaApi(requisicao: Request): Headers {
  const cabecalhos = new Headers({
    accept: "application/json",
    "content-type": "application/json",
    // A API confere a lista fechada de origens antes de toda escrita.
    origin: new URL(requisicao.url).origin,
    "x-simpleclick-client": "navegador",
  });
  const origemRecebida = requisicao.headers.get("origin");
  if (origemRecebida !== null) cabecalhos.set("origin", origemRecebida);
  return cabecalhos;
}

async function corpoParaApi(
  requisicao: Request,
  acao: AcaoDeSessao,
): Promise<string | undefined> {
  if (acao === "login") return requisicao.text();

  const refresh = lerTokenDeRenovacaoDoCookie(requisicao.headers.get("cookie"));
  if (refresh === undefined) return undefined;
  return JSON.stringify({ tokenDeRenovacao: refresh });
}

/**
 * Encaminha login ou renovação para a API sem revelar tokens à página web.
 * `buscar` entra por parâmetro para permitir teste sem rede no futuro.
 */
export async function responderAcaoDeSessao(
  requisicao: Request,
  acao: string,
  buscar: typeof fetch = fetch,
  fonte: Readonly<Record<string, string | undefined>> = process.env,
): Promise<Response> {
  if (!ehAcaoDeSessao(acao)) {
    return respostaJson(404, { erro: "nao_encontrado" });
  }

  const corpo = await corpoParaApi(requisicao, acao);
  if (acao === "renovar" && corpo === undefined) {
    return respostaJson(401, { erro: "nao_autenticado" });
  }

  let respostaDaApi: Response;
  try {
    respostaDaApi = await buscar(`${enderecoDaApi()}${caminhoDaApi(acao)}`, {
      method: "POST",
      headers: cabecalhosParaApi(requisicao),
      body: corpo,
      cache: "no-store",
    });
  } catch {
    return respostaJson(503, { erro: "indisponivel" });
  }

  let corpoDaApi: unknown;
  try {
    corpoDaApi = await respostaDaApi.json();
  } catch {
    return respostaJson(502, { erro: "resposta_invalida" });
  }

  if (!respostaDaApi.ok) {
    // A API já escolheu um erro seguro. A ponte nunca repassa seus cabeçalhos
    // Set-Cookie nem um corpo que pudesse carregar token por acidente.
    return respostaJson(respostaDaApi.status, { erro: "nao_autenticado" });
  }

  const sessao = sessaoRecebida(corpoDaApi);
  if (sessao === undefined)
    return respostaJson(502, { erro: "resposta_invalida" });
  return responderSessaoDoNavegador(sessao, fonte);
}
