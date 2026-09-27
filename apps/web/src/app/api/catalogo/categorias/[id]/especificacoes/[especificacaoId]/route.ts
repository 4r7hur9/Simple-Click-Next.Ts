import { encaminharAoPainel } from "../../../../../../../server/encaminhar-ao-painel.ts";

/**
 * Renomear, ajustar e remover uma especificação (T-301). A primeira tentativa
 * com produto afetado volta 409 com o impacto; a tela confirma e repete.
 */
type Contexto = {
  params: Promise<{ id: string; especificacaoId: string }>;
};

async function encaminhar(requisicao: Request, contexto: Contexto) {
  const { id, especificacaoId } = await contexto.params;
  return encaminharAoPainel(
    requisicao,
    `categorias/${encodeURIComponent(id)}/especificacoes/${encodeURIComponent(especificacaoId)}`,
  );
}

export function PATCH(requisicao: Request, contexto: Contexto) {
  return encaminhar(requisicao, contexto);
}

export function DELETE(requisicao: Request, contexto: Contexto) {
  return encaminhar(requisicao, contexto);
}
