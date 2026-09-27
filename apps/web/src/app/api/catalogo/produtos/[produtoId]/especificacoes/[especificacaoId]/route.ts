import { encaminharAoPainel } from "../../../../../../../server/encaminhar-ao-painel.ts";

/**
 * Descartar um valor guardado de especificação que a categoria atual do
 * produto não usa (T-310, AC-329). Sem confirmação, a API responde o que
 * seria apagado, e nada muda.
 */
type Contexto = {
  params: Promise<{ produtoId: string; especificacaoId: string }>;
};

export async function DELETE(requisicao: Request, contexto: Contexto) {
  const { produtoId, especificacaoId } = await contexto.params;
  return encaminharAoPainel(
    requisicao,
    `produtos/${encodeURIComponent(produtoId)}/especificacoes/${encodeURIComponent(especificacaoId)}`,
  );
}
