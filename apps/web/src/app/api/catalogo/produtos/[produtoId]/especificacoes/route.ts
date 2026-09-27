import { encaminharAoPainel } from "../../../../../../server/encaminhar-ao-painel.ts";

/** As especificações que o produto herda da categoria, e o preenchimento (T-301). */
type Contexto = { params: Promise<{ produtoId: string }> };

async function encaminhar(requisicao: Request, contexto: Contexto) {
  const { produtoId } = await contexto.params;
  return encaminharAoPainel(
    requisicao,
    `produtos/${encodeURIComponent(produtoId)}/especificacoes`,
  );
}

export function GET(requisicao: Request, contexto: Contexto) {
  return encaminhar(requisicao, contexto);
}

export function PUT(requisicao: Request, contexto: Contexto) {
  return encaminhar(requisicao, contexto);
}
