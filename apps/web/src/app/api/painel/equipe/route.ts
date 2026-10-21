/** A equipe da loja: listar e cadastrar (só o dono, card #32). */
import { encaminharALoja } from "../../../../server/encaminhar-a-loja.ts";

export async function GET(requisicao: Request): Promise<Response> {
  return encaminharALoja(requisicao, "equipe");
}

export async function POST(requisicao: Request): Promise<Response> {
  return encaminharALoja(requisicao, "equipe");
}
