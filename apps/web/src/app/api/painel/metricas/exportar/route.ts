import { encaminharLeituraDaLoja } from "../../../../../server/encaminhar-ao-painel.ts";

/**
 * A planilha do período, baixada pela tela do painel (T-808).
 *
 * O site leva a sessão do cookie e o mesmo recorte da tela a
 * `GET /v1/lojas/:apelido/metricas/exportar`, e devolve o arquivo com o nome
 * que a API deu a ele.
 */
export async function GET(requisicao: Request): Promise<Response> {
  return encaminharLeituraDaLoja(requisicao, "metricas/exportar");
}
