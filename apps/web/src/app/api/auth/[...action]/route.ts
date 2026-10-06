/**
 * Ponte de identidade do site (T-113): `/api/auth/<acao>`.
 *
 * Formulários sem script (confirmar e-mail, recuperar e definir senha) vão
 * para `formularios-de-acesso.ts` e voltam por redirecionamento; o resto
 * (login, segundo fator, renovar, cadastro, aplicativo) vai para `sessao.ts`
 * e volta em JSON. Os tokens nunca atravessam esta resposta para o
 * JavaScript da página: só os cookies HttpOnly `sc_access` e `sc_refresh`.
 */
import {
  ehFormularioDeAcesso,
  responderFormularioDeAcesso,
} from "../../../../server/formularios-de-acesso";
import { responderAcaoDeSessao } from "../../../../server/sessao";

/** A autenticação manipula cookie e deve continuar no runtime Node. */
export const runtime = "nodejs";

/**
 * Fora de produção o site roda em `http://localhost`, e o navegador recusa
 * cookie `Secure` vindo de HTTP: o atributo sai só aqui, só fora de produção.
 */
function cookiesParaOAmbiente(resposta: Response): Response {
  const setCookies = resposta.headers.get("set-cookie");
  if (setCookies === null || process.env.NODE_ENV === "production") {
    return resposta;
  }
  const cabecalhosComCookies = resposta.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const linhas =
    cabecalhosComCookies.getSetCookie?.() ?? setCookies.split(/\r?\n/);
  const cabecalhos = new Headers(resposta.headers);
  cabecalhos.delete("set-cookie");
  for (const linha of linhas) {
    const nome = (linha.split(";")[0] ?? "").split("=")[0]?.trim();
    if (nome !== "sc_access" && nome !== "sc_refresh") continue;
    cabecalhos.append(
      "set-cookie",
      linha
        .split(";")
        .filter((atributo) => atributo.trim().toLowerCase() !== "secure")
        .join(";"),
    );
  }
  return new Response(resposta.body, {
    status: resposta.status,
    headers: cabecalhos,
  });
}

/** Borda BFF: tokens nunca atravessam esta resposta para o JavaScript web. */
export async function POST(
  requisicao: Request,
  contexto: { params: Promise<{ action: string[] }> },
): Promise<Response> {
  const { action } = await contexto.params;
  const acao = action.join("/");
  if (ehFormularioDeAcesso(acao)) {
    return responderFormularioDeAcesso(requisicao, acao);
  }
  return cookiesParaOAmbiente(await responderAcaoDeSessao(requisicao, acao));
}
