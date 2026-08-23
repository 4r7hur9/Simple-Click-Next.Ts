import { responderAcaoDeSessao } from "../../../../server/sessao";

/** A autenticação manipula cookie e deve continuar no runtime Node. */
export const runtime = "nodejs";

/** Borda BFF: tokens nunca atravessam esta resposta para o JavaScript web. */
export async function POST(
  requisicao: Request,
  contexto: { params: Promise<{ action: string[] }> },
): Promise<Response> {
  const { action } = await contexto.params;
  return responderAcaoDeSessao(requisicao, action.join("/"));
}
