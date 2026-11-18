/**
 * Trocar e apagar um endereço salvo da pessoa (T-707).
 *
 * Card #111: o identificador só passa se for um UUID (a API usa `z.uuid()`);
 * `..` ou `.` virariam `/v1/conta/` ao serem normalizados pela URL. Escrita
 * de fora do site é recusada antes (`recusarAcaoDeFora`).
 */
import { recusarAcaoDeFora } from "../../../../../server/protecao-da-conta.ts";
import { encaminharAConta } from "../../../../../server/encaminhar-a-loja.ts";

type Contexto = { params: Promise<{ id: string }> };

const UUID =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

async function encaminhar(
  requisicao: Request,
  contexto: Contexto,
): Promise<Response> {
  const { id } = await contexto.params;
  if (!UUID.test(id)) {
    return Response.json({ erro: "nao_encontrado" }, { status: 404 });
  }
  const recusada = await recusarAcaoDeFora(requisicao);
  if (recusada !== null) return recusada;
  return encaminharAConta(requisicao, `enderecos/${encodeURIComponent(id)}`);
}

export function PUT(
  requisicao: Request,
  contexto: Contexto,
): Promise<Response> {
  return encaminhar(requisicao, contexto);
}

export function DELETE(
  requisicao: Request,
  contexto: Contexto,
): Promise<Response> {
  return encaminhar(requisicao, contexto);
}
