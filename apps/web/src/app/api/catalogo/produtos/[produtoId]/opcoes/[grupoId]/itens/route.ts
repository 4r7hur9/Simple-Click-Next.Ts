import { enderecoDaApi } from "../../../../../../../../server/api-client.ts";
import { lerTokenDeAcessoDoCookie } from "../../../../../../../../server/session-cookie.ts";

const APELIDO_DA_LOJA =
  process.env.NEXT_PUBLIC_DEV_STORE_SLUG ?? "pastelaria-da-vila";

export async function POST(
  requisicao: Request,
  contexto: { params: Promise<{ produtoId: string; grupoId: string }> },
) {
  const token = lerTokenDeAcessoDoCookie(requisicao.headers.get("cookie"));
  if (token === undefined)
    return Response.json({ erro: "nao_autenticado" }, { status: 401 });
  const { produtoId, grupoId } = await contexto.params;
  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(APELIDO_DA_LOJA)}/catalogo/produtos/${encodeURIComponent(produtoId)}/opcoes/${encodeURIComponent(grupoId)}/itens`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        origin: new URL(requisicao.url).origin,
        "content-type": "application/json",
      },
      body: await requisicao.text(),
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
