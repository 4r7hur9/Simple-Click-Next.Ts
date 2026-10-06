import { enderecoDaApi } from "../../../../server/api-client.ts";
import { sessaoParaEncaminhar } from "../../../../server/loja-do-painel.ts";

async function encaminhar(requisicao: Request): Promise<Response> {
  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;
  const { token } = sessao;

  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(sessao.apelido)}/catalogo/categorias`,
    {
      method: requisicao.method,
      cache: "no-store",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        origin: new URL(requisicao.url).origin,
        ...(requisicao.method === "POST" || requisicao.method === "PUT"
          ? { "content-type": "application/json" }
          : {}),
      },
      ...(requisicao.method === "POST" || requisicao.method === "PUT"
        ? { body: await requisicao.text() }
        : {}),
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

export function GET(requisicao: Request) {
  return encaminhar(requisicao);
}

export function POST(requisicao: Request) {
  return encaminhar(requisicao);
}

export function PUT(requisicao: Request) {
  return encaminhar(requisicao);
}
