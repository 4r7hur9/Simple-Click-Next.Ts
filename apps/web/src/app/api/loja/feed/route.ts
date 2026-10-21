import { enderecoDaApi } from "../../../../server/api-client.ts";
import { sessaoParaEncaminhar } from "../../../../server/loja-do-painel.ts";

/**
 * A configuração do feed da loja (aparecer no feed, publicar produtos novos):
 * o site encaminha a leitura e a gravação para a API, que confere a permissão
 * `feed` (só o dono; a equipe recebe 403). O formulário de produto também lê
 * daqui: 403 é o sinal de que o checkbox "Publicar no feed" não é dela.
 */
async function encaminhar(requisicao: Request): Promise<Response> {
  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;

  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(sessao.apelido)}/feed`,
    {
      method: requisicao.method,
      cache: "no-store",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${sessao.token}`,
        origin: new URL(requisicao.url).origin,
        ...(requisicao.method === "PUT"
          ? { "content-type": "application/json" }
          : {}),
      },
      ...(requisicao.method === "PUT" ? { body: await requisicao.text() } : {}),
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

export async function GET(requisicao: Request) {
  return encaminhar(requisicao);
}

export async function PUT(requisicao: Request) {
  return encaminhar(requisicao);
}
