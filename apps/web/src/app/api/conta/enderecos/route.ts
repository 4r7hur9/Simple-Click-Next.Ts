/** Os endereços salvos da pessoa, encaminhados à área da conta (T-707). */
import { recusarAcaoDeFora } from "../../../../server/protecao-da-conta.ts";
import { encaminharAConta } from "../../../../server/encaminhar-a-loja.ts";

export function GET(requisicao: Request): Promise<Response> {
  return encaminharAConta(requisicao, "enderecos");
}

/** Escrita: confere a origem e o tipo antes (card #111, AC-11126). */
export async function POST(requisicao: Request): Promise<Response> {
  const recusada = await recusarAcaoDeFora(requisicao);
  if (recusada !== null) return recusada;
  return encaminharAConta(requisicao, "enderecos");
}
