/** A repetição de um pedido antigo com os preços de hoje (T-706). */
import { encaminharALoja } from "../../../../../../server/encaminhar-a-loja.ts";

export async function POST(
  requisicao: Request,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await contexto.params;
  return encaminharALoja(
    requisicao,
    `pedidos/${encodeURIComponent(id)}/repetir`,
  );
}
