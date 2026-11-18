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
import {
  recusarAcaoDeFora,
  recusarOrigemDeFora,
} from "../../../../server/protecao-da-conta.ts";
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
    if (nome !== "sc_access" && nome !== "sc_refresh" && nome !== "sc_loja") {
      continue;
    }
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
  // Card #134: pedido de outro site é recusado antes de qualquer coisa. O
  // formulário sem script manda `form-urlencoded`, então nele só a origem é
  // conferida; as ações JSON também recusam corpo que não é JSON (415).
  if (ehFormularioDeAcesso(acao)) {
    const deFora = recusarOrigemDeFora(requisicao);
    if (deFora !== null) return deFora;
    return responderFormularioDeAcesso(requisicao, acao);
  }
  const recusada = await recusarAcaoDeFora(requisicao);
  if (recusada !== null) return recusada;
  return cookiesParaOAmbiente(await responderAcaoDeSessao(requisicao, acao));
}
