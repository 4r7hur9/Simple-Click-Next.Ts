/** A ficha de um cliente: ler, corrigir e remover (T-703, T-706). */
import { encaminharALoja } from "../../../../../server/encaminhar-a-loja.ts";

type Contexto = { params: Promise<{ id: string }> };

async function caminho(contexto: Contexto): Promise<string> {
  const { id } = await contexto.params;
  return `clientes/${encodeURIComponent(id)}`;
}

export async function GET(
  requisicao: Request,
  contexto: Contexto,
): Promise<Response> {
  return encaminharALoja(requisicao, await caminho(contexto));
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
