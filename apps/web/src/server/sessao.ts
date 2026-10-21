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
import { enderecoDaApi } from "./api-client.ts";
import { usuarioDoEu } from "../lib/quem-esta-logado.ts";
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
  "lojas",
  "aplicativo/preparar",
  "aplicativo/confirmar",
  "aplicativo/codigos-de-recuperacao",
] as const;

export type AcaoDeSessao = (typeof ACOES_DE_SESSAO)[number];

/**
 * As ações cuja resposta de sucesso é uma sessão aberta. O cadastro de
 * cliente também abre: a conta nasce verificada e a pessoa já entra logada.
 */
const ABREM_SESSAO: ReadonlySet<AcaoDeSessao> = new Set([
  "login",
  "renovar",
  "segundo-fator",
  "segundo-fator/recuperacao",
  "cadastro",
  "lojas",
]);

/** As ações de quem já está logado: vão com o Bearer do cookie de acesso. */
const DE_QUEM_ESTA_LOGADO: ReadonlySet<AcaoDeSessao> = new Set([
  "lojas",
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
 * Para onde cada papel vai depois de entrar, quando a tela não trouxe um
 * `?proximo=` (quem entrou de dentro de uma loja volta para ela: a tela de
 * entrar dá preferência ao destino conferido). O cliente começa pelo feed
 * (/explorar, card #37); dono e administração, pela área deles.
 */
export function destinoDoPapel(papel: unknown): string {
  if (papel === "OWNER") return "/painel";
  if (papel === "ADMIN") return "/admin";
  return DESTINO_DO_CLIENTE;
}

/** A tela do cliente depois de entrar: o feed, na aba de produtos. */
export const DESTINO_DO_CLIENTE = "/explorar/produtos";

/** A conferência do papel não segura o login: passou disso, vale o papel. */
const ESPERA_DO_EU_EM_MS = 2500;

/**
 * O destino de quem acabou de entrar. A equipe entra com sessão de cliente
 * (o papel no painel vem do vínculo com a loja), então o `CUSTOMER` é
 * conferido em `/v1/eu`: quem tem loja vai para o painel; o resto, para o
 * feed. API fora do ar na conferência: segue como cliente.
 */
export async function destinoDaSessao(
  papel: unknown,
  tokenDeAcesso: string,
  buscar: typeof fetch = fetch,
): Promise<string> {
  if (papel !== "CUSTOMER") return destinoDoPapel(papel);
  try {
    const resposta = await buscar(`${enderecoDaApi()}/v1/eu`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(ESPERA_DO_EU_EM_MS),
      headers: {
        accept: "application/json",
        authorization: `Bearer ${tokenDeAcesso}`,
      },
    });
    if (!resposta?.ok) return DESTINO_DO_CLIENTE;
    const usuario = usuarioDoEu(await resposta.json());
    if (usuario.papel === "admin") return "/admin";
    if (usuario.papel === "dono" || usuario.papel === "equipe") return "/painel";
    return DESTINO_DO_CLIENTE;
  } catch {
    return DESTINO_DO_CLIENTE;
  }
}

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
  status = 200,
): Response {
  const cabecalhos = new Headers();
  adicionarCookieDeRenovacao(cabecalhos, sessao.tokenDeRenovacao, fonte);
  adicionarCookieDeAcesso(cabecalhos, sessao.tokenDeAcesso, fonte);
  return respostaJson(
    status,
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
    (resposta.status === 200 || resposta.status === 201) &&
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
    const redirecionarPara = await destinoDaSessao(
      recebido["papel"],
      tokenDeAcesso,
      buscar,
    );
    const mensagem = recebido["mensagem"];
    // O cadastro mantém o 201 (a tela de cadastro lê "criado" por ele).
    const aberta = responderSessaoDoNavegador(
      { tokenDeAcesso, tokenDeRenovacao, acessoExpiraEm },
      fonte,
      {
        status: "SESSAO_CRIADA",
        papel: recebido["papel"],
        redirecionarPara,
        ...(typeof orientarPara === "string" ? { orientarPara } : {}),
        ...(recebido["cadastrado"] === true ? { cadastrado: true } : {}),
        ...(typeof mensagem === "string" ? { mensagem } : {}),
        ...(typeof recebido["loja"] === "object" && recebido["loja"] !== null
          ? { loja: recebido["loja"] }
          : {}),
      },
      resposta.status,
    );
    // Loja nova: a escolha guardada de uma conta anterior neste navegador
    // não vale mais, e o painel abre direto na loja que acabou de nascer.
    if (acao === "lojas") {
      aberta.headers.append("set-cookie", "sc_loja=; Max-Age=0; Path=/");
    }
    return aberta;
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
