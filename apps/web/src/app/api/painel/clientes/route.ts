/** A lista e o cadastro de clientes, encaminhados à API da loja (T-700, T-702). */
import { encaminharALoja } from "../../../../server/encaminhar-a-loja.ts";

export function GET(requisicao: Request): Promise<Response> {
  return encaminharALoja(requisicao, "clientes");
}

export function POST(requisicao: Request): Promise<Response> {
  return encaminharALoja(requisicao, "clientes");
}
