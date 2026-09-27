import { encaminharAoPainel } from "../../../../../../../../server/encaminhar-ao-painel.ts";

/** Acrescentar um valor à lista de uma especificação (T-301, AC-327). */
type Contexto = {
  params: Promise<{ id: string; especificacaoId: string }>;
};

export async function POST(requisicao: Request, contexto: Contexto) {
  const { id, especificacaoId } = await contexto.params;
  return encaminharAoPainel(
    requisicao,
    `categorias/${encodeURIComponent(id)}/especificacoes/${encodeURIComponent(especificacaoId)}/opcoes`,
  );
}
