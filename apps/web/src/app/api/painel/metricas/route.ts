import { encaminharLeituraDaLoja } from "../../../../server/encaminhar-ao-painel.ts";

/**
 * As métricas do período, para a tela do painel (T-803, T-804).
 *
 * A tela pede `/api/painel/metricas?periodo=7d`; o site leva a sessão do
 * cookie e a mesma consulta a `GET /v1/lojas/:apelido/metricas`.
 */
export async function GET(requisicao: Request): Promise<Response> {
  return encaminharLeituraDaLoja(requisicao, "metricas");
}
