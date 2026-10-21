import { enderecoDaApi } from "../../../../../../../server/api-client.ts";
import { sessaoParaEncaminhar } from "../../../../../../../server/loja-do-painel.ts";

/** "Avisar abaixo de" do produto inteiro (card #52). */
export async function PUT(
  requisicao: Request,
  contexto: { params: Promise<{ produtoId: string }> },
) {
  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;
  const { token } = sessao;
  const { produtoId } = await contexto.params;
  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(sessao.apelido)}/catalogo/produtos/${encodeURIComponent(produtoId)}/estoque/alerta`,
    {
      method: "PUT",
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
