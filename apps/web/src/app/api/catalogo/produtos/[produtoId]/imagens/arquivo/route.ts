import { enderecoDaApi } from "../../../../../../../server/api-client.ts";
import { lerTokenDeAcessoDoCookie } from "../../../../../../../server/session-cookie.ts";

/**
 * Envio do ARQUIVO da foto do produto (T-303, AC-306).
 *
 * O corpo são bytes, e não JSON: por isso esta rota não usa o encaminhamento
 * comum do painel, que lê o corpo como texto e estragaria a imagem. A
 * conferência do conteúdo acontece na API — esta rota só leva os bytes, a
 * sessão e as opções da consulta (principal, texto alternativo).
 */
const APELIDO_DA_LOJA =
  process.env.NEXT_PUBLIC_DEV_STORE_SLUG ?? "pastelaria-da-vila";

export async function POST(
  requisicao: Request,
  contexto: { params: Promise<{ produtoId: string }> },
): Promise<Response> {
  const token = lerTokenDeAcessoDoCookie(requisicao.headers.get("cookie"));
  if (token === undefined) {
    return Response.json({ erro: "nao_autenticado" }, { status: 401 });
  }
  const { produtoId } = await contexto.params;
  const consulta = new URL(requisicao.url).search;
  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(APELIDO_DA_LOJA)}/catalogo/produtos/${encodeURIComponent(produtoId)}/imagens/arquivo${consulta}`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        origin: new URL(requisicao.url).origin,
        "content-type":
          requisicao.headers.get("content-type") ?? "application/octet-stream",
      },
      body: await requisicao.arrayBuffer(),
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
