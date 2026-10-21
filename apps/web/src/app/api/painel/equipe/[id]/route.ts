/** Uma pessoa da equipe: ativar, desativar e remover (só o dono, card #32). */
import { encaminharALoja } from "../../../../../server/encaminhar-a-loja.ts";

type Contexto = { params: Promise<{ id: string }> };

async function caminho(contexto: Contexto): Promise<string> {
  const { id } = await contexto.params;
  return `equipe/${encodeURIComponent(id)}`;
}

export async function PATCH(
  requisicao: Request,
  contexto: Contexto,
): Promise<Response> {
  return encaminharALoja(requisicao, await caminho(contexto));
}

export async function DELETE(
  requisicao: Request,
  contexto: Contexto,
): Promise<Response> {
  return encaminharALoja(requisicao, await caminho(contexto));
}
