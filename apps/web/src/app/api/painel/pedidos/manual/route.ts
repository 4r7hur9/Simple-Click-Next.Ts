/** O pedido lançado pelo dono, encaminhado à API da loja (T-704). */
import { encaminharALoja } from "../../../../../server/encaminhar-a-loja.ts";

export function POST(requisicao: Request): Promise<Response> {
  return encaminharALoja(requisicao, "pedidos/manual");
}
