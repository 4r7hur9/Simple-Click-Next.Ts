import { responderAcaoDeSessao } from "../../../../server/sessao";

/** A autenticação manipula cookie e deve continuar no runtime Node. */
export const runtime = "nodejs";

/** Borda BFF: tokens nunca atravessam esta resposta para o JavaScript web. */
export async function POST(
  requisicao: Request,
  contexto: { params: Promise<{ action: string[] }> },
): Promise<Response> {
  const { action } = await contexto.params;
  const resposta = await responderAcaoDeSessao(requisicao, action.join("/"));
  const setCookies = resposta.headers.get("set-cookie");
  if (resposta.ok && setCookies !== null) {
    const cabecalhosComCookies = resposta.headers as Headers & {
      getSetCookie?: () => string[];
    };
    const linhas =
      cabecalhosComCookies.getSetCookie?.() ?? setCookies.split(/\r?\n/);
    const cabecalhos = new Headers(resposta.headers);
    cabecalhos.delete("set-cookie");
    for (const linha of linhas) {
      const par = linha.split(";")[0];
      if (par === undefined) continue;
      const separador = par.indexOf("=");
      if (separador < 1) continue;
      const nome = par.slice(0, separador).trim();
      if (nome !== "sc_access" && nome !== "sc_refresh") continue;
      const normalizada =
        process.env.NODE_ENV === "production"
          ? linha
          : linha
              .split(";")
              .filter((atributo) => atributo.trim().toLowerCase() !== "secure")
              .join(";");
      cabecalhos.append("set-cookie", normalizada);
    }
    return new Response(await resposta.text(), {
      status: resposta.status,
      headers: cabecalhos,
    });
  }
  return resposta;
}
