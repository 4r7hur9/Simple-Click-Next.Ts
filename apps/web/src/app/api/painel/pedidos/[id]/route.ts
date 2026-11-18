import { enderecoDaApi } from "../../../../../server/api-client.ts";
import { sessaoParaEncaminhar } from "../../../../../server/loja-do-painel.ts";
import { recusarAcaoDeFora } from "../../../../../server/protecao-da-conta.ts";

async function encaminhar(
  requisicao: Request,
  pedidoId: string,
): Promise<Response> {
  const recusada = await recusarAcaoDeFora(requisicao);
  if (recusada !== null) return recusada;

  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;
  const { token } = sessao;

  const corpo =
    requisicao.method === "PATCH" ? await requisicao.text() : undefined;
  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(sessao.apelido)}/pedidos/${encodeURIComponent(pedidoId)}${requisicao.method === "PATCH" ? "/status" : ""}`,
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

  return new Response(await resposta.text(), {
    status: resposta.status,
    headers: {
      "cache-control": "no-store",
      "content-type":
        resposta.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function GET(
  requisicao: Request,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await contexto.params;
  return encaminhar(requisicao, id);
}

export async function PATCH(
  requisicao: Request,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await contexto.params;
  return encaminhar(requisicao, id);
}
