import { enderecoDaApi } from "../../../../../server/api-client.ts";
import { sessaoParaEncaminhar } from "../../../../../server/loja-do-painel.ts";

type Contexto = { params: Promise<{ id: string }> };

export function PATCH(
  requisicao: Request,
  contexto: Contexto,
): Promise<Response> {
  return encaminhar(requisicao, contexto);
}

/**
 * Apagar leva o destino dos produtos no corpo (AC-303). Sem ele, a API
 * responde 409 com a contagem, e é essa resposta que a tela usa para perguntar.
 */
export function DELETE(
  requisicao: Request,
  contexto: Contexto,
): Promise<Response> {
  return encaminhar(requisicao, contexto);
}

async function encaminhar(
  requisicao: Request,
  contexto: Contexto,
): Promise<Response> {
  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;
  const { token } = sessao;
  const { id } = await contexto.params;
  const corpoDoPedido = await requisicao.text();
  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(sessao.apelido)}/catalogo/categorias/${encodeURIComponent(id)}`,
    {
      method: requisicao.method,
      cache: "no-store",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        origin: new URL(requisicao.url).origin,
        "content-type": "application/json",
      },
      body: corpoDoPedido === "" ? "{}" : corpoDoPedido,
    },
  );
  const corpo = await resposta.text();
  return new Response(corpo === "" ? null : corpo, {
    status: resposta.status,
    headers: {
      "cache-control": "no-store",
      ...(resposta.headers.get("content-type")
        ? { "content-type": resposta.headers.get("content-type")! }
        : {}),
    },
  });
}
