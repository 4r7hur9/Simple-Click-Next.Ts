/** Trocar a senha de uma pessoa da equipe (só o dono, card #32). */
import { encaminharALoja } from "../../../../../../server/encaminhar-a-loja.ts";

type Contexto = { params: Promise<{ id: string }> };

export async function PUT(
  requisicao: Request,
  contexto: Contexto,
): Promise<Response> {
  const { id } = await contexto.params;
  return encaminharALoja(requisicao, `equipe/${encodeURIComponent(id)}/senha`);
}
