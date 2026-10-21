import { NextResponse, type NextRequest } from "next/server";

/**
 * Renova o acesso que expirou, sem a pessoa perceber.
 *
 * O cookie `sc_access` dura 15 minutos. Sem esta renovação, passado esse
 * tempo a pessoa continuava com o cookie de renovação (`sc_refresh`, 30 dias)
 * mas o site a tratava como visitante: sumia o menu do usuário e o sair, e
 * as telas da administração e do painel respondiam "sua sessão não tem
 * acesso". O proxy troca o acesso vencido por um novo ANTES da página
 * renderizar: a requisição segue com o cookie novo e a resposta o grava no
 * navegador.
 *
 * O token de renovação é de uso único (a API gira ele a cada troca). Por isso
 * as requisições simultâneas da mesma pessoa (página, prefetch, polling)
 * dividem UMA troca em andamento, e o resultado fica guardado por alguns
 * segundos; sem isso a segunda tentativa usaria um token já gasto.
 *
 * ATENÇÃO: isto NÃO autoriza nada. Só devolve o cookie; quem decide o que a
 * pessoa vê continua sendo a API e a camada de servidor.
 */

const FOLGA_EM_SEGUNDOS = 30;
const GUARDA_EM_MS = 15_000;

interface Troca {
  readonly setCookies: readonly string[];
  readonly cookieDeAcesso: string | null;
  readonly cookieDeRenovacao: string | null;
  readonly expiraEm: number;
}

const trocas = new Map<string, Promise<Troca | null>>();

/** Lê o `exp` do JWT sem verificar a assinatura: só decide se vale renovar. */
export function acessoVencido(token: string | undefined, agora = Date.now()) {
  if (token === undefined || token === "") return true;
  const meio = token.split(".")[1];
  if (meio === undefined) return true;
  try {
    const carga = JSON.parse(
      Buffer.from(meio, "base64url").toString("utf8"),
    ) as { exp?: unknown };
    if (typeof carga.exp !== "number") return true;
    return carga.exp * 1000 - FOLGA_EM_SEGUNDOS * 1000 <= agora;
  } catch {
    return true;
  }
}

function valorDoCookie(setCookie: string, nome: string): string | null {
  const inicio = `${nome}=`;
  return setCookie.startsWith(inicio)
    ? (setCookie.slice(inicio.length).split(";")[0] ?? null)
    : null;
}

async function trocar(
  requisicao: NextRequest,
  renovacao: string,
): Promise<Troca | null> {
  try {
    const resposta = await fetch(new URL("/api/auth/renovar", requisicao.url), {
      method: "POST",
      headers: { cookie: `sc_refresh=${renovacao}` },
      cache: "no-store",
    });
    if (!resposta.ok) return null;
    const setCookies = resposta.headers.getSetCookie();
    const acesso = setCookies
      .map((linha) => valorDoCookie(linha, "sc_access"))
      .find((valor) => valor !== null);
    const novaRenovacao = setCookies
      .map((linha) => valorDoCookie(linha, "sc_refresh"))
      .find((valor) => valor !== null);
    if (acesso === undefined || acesso === null) return null;
    return {
      setCookies,
      cookieDeAcesso: acesso,
      cookieDeRenovacao: novaRenovacao ?? null,
      expiraEm: Date.now() + GUARDA_EM_MS,
    };
  } catch {
    return null;
  }
}

/**
 * Se o acesso venceu e há renovação, devolve a resposta que segue com o
 * cookie novo (e o grava no navegador). Sem nada a renovar, devolve `null`.
 */
export async function renovarAcessoSeVenceu(
  requisicao: NextRequest,
): Promise<NextResponse | null> {
  const acesso = requisicao.cookies.get("sc_access")?.value;
  const renovacao = requisicao.cookies.get("sc_refresh")?.value;
  if (renovacao === undefined || renovacao === "") return null;
  if (!acessoVencido(acesso)) return null;

  let andamento = trocas.get(renovacao);
  if (andamento === undefined) {
    andamento = trocar(requisicao, renovacao);
    trocas.set(renovacao, andamento);
    setTimeout(() => trocas.delete(renovacao), GUARDA_EM_MS).unref?.();
  }
  const troca = await andamento;
  if (troca === null || troca.cookieDeAcesso === null) return null;

  const cabecalhos = new Headers(requisicao.headers);
  const cookies = new Map(
    (cabecalhos.get("cookie") ?? "")
      .split(/;\s*/)
      .filter(Boolean)
      .map((par) => {
        const i = par.indexOf("=");
        return [par.slice(0, i), par.slice(i + 1)] as const;
      }),
  );
  cookies.set("sc_access", troca.cookieDeAcesso);
  if (troca.cookieDeRenovacao !== null) {
    cookies.set("sc_refresh", troca.cookieDeRenovacao);
  }
  cabecalhos.set(
    "cookie",
    [...cookies].map(([nome, valor]) => `${nome}=${valor}`).join("; "),
  );

  const resposta = NextResponse.next({ request: { headers: cabecalhos } });
  for (const linha of troca.setCookies) {
    resposta.headers.append("set-cookie", linha);
  }
  return resposta;
}
