/** Os endereços salvos da pessoa, encaminhados à área da conta (T-707). */
import { encaminharAConta } from "../../../../server/encaminhar-a-loja.ts";

export function GET(requisicao: Request): Promise<Response> {
  return encaminharAConta(requisicao, "enderecos");
}

export function POST(requisicao: Request): Promise<Response> {
  return encaminharAConta(requisicao, "enderecos");
}
