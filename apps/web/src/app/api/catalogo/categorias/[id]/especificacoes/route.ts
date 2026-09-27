import { encaminharAoPainel } from "../../../../../../server/encaminhar-ao-painel.ts";

/** As especificações de uma categoria: listar, criar e reordenar (T-301). */
type Contexto = { params: Promise<{ id: string }> };

async function encaminhar(requisicao: Request, contexto: Contexto) {
  const { id } = await contexto.params;
  return encaminharAoPainel(
    requisicao,
    `categorias/${encodeURIComponent(id)}/especificacoes`,
  );
}

export function GET(requisicao: Request, contexto: Contexto) {
  return encaminhar(requisicao, contexto);
}

export function POST(requisicao: Request, contexto: Contexto) {
  return encaminhar(requisicao, contexto);
}

export function PUT(requisicao: Request, contexto: Contexto) {
  return encaminhar(requisicao, contexto);
}
