import { enderecoDaApi } from "../../../../../../server/api-client.ts";
import { sessaoParaEncaminhar } from "../../../../../../server/loja-do-painel.ts";

async function encaminhar(requisicao: Request, produtoId: string) {
  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;
  const { token } = sessao;
  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(sessao.apelido)}/catalogo/produtos/${encodeURIComponent(produtoId)}/estoque`,
    {
      method: requisicao.method,
      cache: "no-store",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        origin: new URL(requisicao.url).origin,
      },
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

export function GET(
  requisicao: Request,
  contexto: { params: Promise<{ produtoId: string }> },
) {
  return contexto.params.then(({ produtoId }) =>
    encaminhar(requisicao, produtoId),
  );
}
