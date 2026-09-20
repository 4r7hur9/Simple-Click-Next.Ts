import { enderecoDaApi } from "../../../../../../server/api-client.ts";
import { lerTokenDeAcessoDoCookie } from "../../../../../../server/session-cookie.ts";

const APELIDO_DA_LOJA =
  process.env.NEXT_PUBLIC_DEV_STORE_SLUG ?? "pastelaria-da-vila";

async function encaminhar(requisicao: Request, produtoId: string) {
  const token = lerTokenDeAcessoDoCookie(requisicao.headers.get("cookie"));
  if (token === undefined) {
    return Response.json({ erro: "nao_autenticado" }, { status: 401 });
  }
  const corpo =
    requisicao.method === "POST" ? await requisicao.text() : undefined;
  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(APELIDO_DA_LOJA)}/catalogo/produtos/${encodeURIComponent(produtoId)}/imagens`,
    {
      method: requisicao.method,
      cache: "no-store",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        origin: new URL(requisicao.url).origin,
        ...(corpo === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(corpo === undefined ? {} : { body: corpo }),
    },
  );
  const respostaCorpo = await resposta.text();
  return new Response(respostaCorpo === "" ? null : respostaCorpo, {
    status: resposta.status,
    headers: {
      "cache-control": "no-store",
      ...(resposta.headers.get("content-type")
        ? { "content-type": resposta.headers.get("content-type")! }
        : {}),
    },
  });
}

export function GET(
  requisicao: Request,
  contexto: { params: Promise<{ produtoId: string }> },
) {
  return contexto.params.then(({ produtoId }) =>
    encaminhar(requisicao, produtoId),
  );
}

export function POST(
  requisicao: Request,
  contexto: { params: Promise<{ produtoId: string }> },
) {
  return contexto.params.then(({ produtoId }) =>
    encaminhar(requisicao, produtoId),
  );
}
