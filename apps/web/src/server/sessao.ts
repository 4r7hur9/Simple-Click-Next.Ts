/**
 * Ponte de sessão entre o navegador e a API (AC-109, AC-111, T-113).
 *
 * A página chama `/api/auth/<acao>` no próprio site; este servidor chama
 * `/v1/auth/...` na API. Quando a API abre uma sessão, os dois tokens viram
 * cookies HttpOnly do site (o de renovação vem do Set-Cookie da API, ou do
 * corpo no atalho local) e o corpo que volta à página não leva token
 * nenhum — só o próximo passo. O cliente nativo não passa por aqui: chama a
 * API direto e recebe o par no corpo.
 */
import {
  chamarIdentidade,
  valorDoSetCookie,
  type ExtrasDaChamada,
} from "./chamada-de-identidade.ts";
import {
  adicionarCookieDeAcesso,
  adicionarCookieDeRenovacao,
  adicionarCookiesQueApagam,
  lerTokenDeAcessoDoCookie,
  lerTokenDeRenovacaoDoCookie,
} from "./session-cookie.ts";

/** Ações que a ponte atende em JSON. Lista fechada: nada de proxy aberto. */
export const ACOES_DE_SESSAO = [
  "login",
  "renovar",
  "segundo-fator",
  "segundo-fator/recuperacao",
  "cadastro",
  "aplicativo/preparar",
  "aplicativo/confirmar",
  "aplicativo/codigos-de-recuperacao",
] as const;

export type AcaoDeSessao = (typeof ACOES_DE_SESSAO)[number];

/** As ações cuja resposta de sucesso é uma sessão aberta. */
const ABREM_SESSAO: ReadonlySet<AcaoDeSessao> = new Set([
  "login",
  "renovar",
  "segundo-fator",
  "segundo-fator/recuperacao",
]);

/** As ações de quem já está logado: vão com o Bearer do cookie de acesso. */
const DE_QUEM_ESTA_LOGADO: ReadonlySet<AcaoDeSessao> = new Set([
  "aplicativo/preparar",
  "aplicativo/confirmar",
  "aplicativo/codigos-de-recuperacao",
]);

/** As ações que não mandam corpo à API. */
const SEM_CORPO: ReadonlySet<AcaoDeSessao> = new Set([
  "renovar",
  "aplicativo/preparar",
  "aplicativo/codigos-de-recuperacao",
]);

export interface SessaoRecebidaDaApi {
  readonly tokenDeAcesso: string;
  readonly tokenDeRenovacao: string;
  readonly acessoExpiraEm: string;
}

/** Só aceita ações conhecidas; caminho livre aqui viraria proxy aberto. */
export function ehAcaoDeSessao(acao: string): acao is AcaoDeSessao {
  return (ACOES_DE_SESSAO as readonly string[]).includes(acao);
}

/**
 * Para onde cada papel vai depois de entrar. O cliente vai para os pedidos
 * dele, que é a primeira tela da conta que existe (a raiz `/minha-conta`
 * ainda não tem página — o ponta a ponta da T-114 achou o 404).
 */
export function destinoDoPapel(papel: unknown): string {
  if (papel === "OWNER") return "/painel";
  if (papel === "ADMIN") return "/admin";
  return DESTINO_DO_CLIENTE;
}

/** A tela do cliente depois de entrar. */
export const DESTINO_DO_CLIENTE = "/minha-conta/pedidos";

function respostaJson(
  status: number,
  corpo: Record<string, unknown>,
  cabecalhos = new Headers(),
): Response {
  cabecalhos.set("cache-control", "no-store");
  cabecalhos.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(corpo), { status, headers: cabecalhos });
}

/**
 * Converte os tokens que só o servidor recebeu em uma resposta segura para a
 * página. O corpo não entrega token de acesso nem de renovação a JavaScript;
 * `extra` acrescenta o próximo passo (papel, destino).
 */
export function responderSessaoDoNavegador(
  sessao: SessaoRecebidaDaApi,
  fonte: Readonly<Record<string, string | undefined>> = process.env,
  extra: Record<string, unknown> = {},
): Response {
  const cabecalhos = new Headers();
  adicionarCookieDeRenovacao(cabecalhos, sessao.tokenDeRenovacao, fonte);
  adicionarCookieDeAcesso(cabecalhos, sessao.tokenDeAcesso, fonte);
  return respostaJson(
    200,
    { autenticado: true, acessoExpiraEm: sessao.acessoExpiraEm, ...extra },
    cabecalhos,
  );
}

/** O corpo sem nenhum campo de token: é o que pode chegar à página. */
function semTokens(corpo: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(corpo).filter(
      ([chave]) => chave !== "tokenDeAcesso" && chave !== "tokenDeRenovacao",
    ),
  );
}

/** Lê o corpo JSON da página; `undefined` quando não é JSON. */
async function corpoDaPagina(requisicao: Request): Promise<unknown> {
  try {
    return await requisicao.json();
  } catch {
    return undefined;
  }
}

/**
 * Atende uma ação da ponte. `buscar` entra por parâmetro para a prova
 * responder sem rede.
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

  const cookies = requisicao.headers.get("cookie");
  const extras: ExtrasDaChamada = {
    tokenDeRenovacao:
      acao === "renovar" ? lerTokenDeRenovacaoDoCookie(cookies) : undefined,
    tokenDeAcesso: DE_QUEM_ESTA_LOGADO.has(acao)
      ? lerTokenDeAcessoDoCookie(cookies)
      : undefined,
  };
  const semCredencial =
    (acao === "renovar" && extras.tokenDeRenovacao === undefined) ||
    (DE_QUEM_ESTA_LOGADO.has(acao) && extras.tokenDeAcesso === undefined);
  if (semCredencial) return respostaJson(401, { erro: "nao_autenticado" });

  const corpo = SEM_CORPO.has(acao)
    ? undefined
    : await corpoDaPagina(requisicao);
  if (!SEM_CORPO.has(acao) && corpo === undefined) {
    return respostaJson(400, { erro: "entrada_invalida" });
  }

  let resposta;
  try {
    resposta = await chamarIdentidade(`/${acao}`, requisicao, corpo, {
      extras,
      buscar,
    });
  } catch {
    return respostaJson(503, { erro: "indisponivel" });
  }

  const recebido = resposta.corpo;
  if (
    ABREM_SESSAO.has(acao) &&
    resposta.status === 200 &&
    recebido["status"] === "SESSAO_CRIADA"
  ) {
    const tokenDeAcesso = recebido["tokenDeAcesso"];
    const acessoExpiraEm = recebido["acessoExpiraEm"];
    // O atalho local manda o refresh no corpo; a rota real, no Set-Cookie.
    const tokenDeRenovacao =
      typeof recebido["tokenDeRenovacao"] === "string"
        ? recebido["tokenDeRenovacao"]
        : valorDoSetCookie(resposta.setCookies, "sc_refresh");
    if (
      typeof tokenDeAcesso !== "string" ||
      tokenDeAcesso === "" ||
      typeof acessoExpiraEm !== "string" ||
      Number.isNaN(Date.parse(acessoExpiraEm)) ||
      tokenDeRenovacao === undefined
    ) {
      return respostaJson(502, { erro: "resposta_invalida" });
    }
    const orientarPara = recebido["orientarPara"];
    return responderSessaoDoNavegador(
      { tokenDeAcesso, tokenDeRenovacao, acessoExpiraEm },
      fonte,
      {
        status: "SESSAO_CRIADA",
        papel: recebido["papel"],
        redirecionarPara: destinoDoPapel(recebido["papel"]),
        ...(typeof orientarPara === "string" ? { orientarPara } : {}),
      },
    );
  }

  // Renovação recusada: a sessão deste navegador acabou; os cookies saem.
  if (acao === "renovar") {
    const cabecalhos = new Headers();
    adicionarCookiesQueApagam(cabecalhos, fonte);
    return respostaJson(401, { erro: "nao_autenticado" }, cabecalhos);
  }

  // O resto passa como a API respondeu, sem nenhum campo de token e sem os
  // Set-Cookie dela.
  return respostaJson(resposta.status, semTokens(recebido));
}
