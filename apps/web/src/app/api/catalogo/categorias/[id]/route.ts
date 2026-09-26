import { enderecoDaApi } from "../../../../../server/api-client.ts";
import { lerTokenDeAcessoDoCookie } from "../../../../../server/session-cookie.ts";

const APELIDO_DA_LOJA =
  process.env.NEXT_PUBLIC_DEV_STORE_SLUG ?? "pastelaria-da-vila";

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
  const token = lerTokenDeAcessoDoCookie(requisicao.headers.get("cookie"));
  if (token === undefined) {
    return Response.json({ erro: "nao_autenticado" }, { status: 401 });
  }
  const { id } = await contexto.params;
  const corpoDoPedido = await requisicao.text();
  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(APELIDO_DA_LOJA)}/catalogo/categorias/${encodeURIComponent(id)}`,
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
