import { enderecoDaApi } from "../../../../server/api-client.ts";
import { sessaoParaEncaminhar } from "../../../../server/loja-do-painel.ts";
import { renovarAposGravar } from "../../../../server/renovar-vitrine.ts";

/**
 * O tema da vitrine (cor de destaque e as duas fotos): o site encaminha a
 * leitura e a gravação do dono para a API, que confere a permissão de
 * personalização (só o dono) e guarda. Depois de gravar, as páginas públicas da
 * loja são renovadas para já saírem na cor nova.
 */
async function encaminhar(requisicao: Request): Promise<Response> {
  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;

  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(sessao.apelido)}/tema`,
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

  renovarAposGravar(sessao.apelido, requisicao.method, resposta.status);

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
