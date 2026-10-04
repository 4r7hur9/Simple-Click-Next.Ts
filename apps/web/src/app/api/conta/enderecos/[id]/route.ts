/** Trocar e apagar um endereço salvo da pessoa (T-707). */
import { encaminharAConta } from "../../../../../server/encaminhar-a-loja.ts";

type Contexto = { params: Promise<{ id: string }> };

async function caminho(contexto: Contexto): Promise<string> {
  const { id } = await contexto.params;
  return `enderecos/${encodeURIComponent(id)}`;
}

export async function PUT(
  requisicao: Request,
  contexto: Contexto,
): Promise<Response> {
  return encaminharAConta(requisicao, await caminho(contexto));
}

export async function DELETE(
  requisicao: Request,
  contexto: Contexto,
): Promise<Response> {
  return encaminharAConta(requisicao, await caminho(contexto));
}
