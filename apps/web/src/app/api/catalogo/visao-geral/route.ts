import { enderecoDaApi } from "../../../../server/api-client.ts";
import { sessaoParaEncaminhar } from "../../../../server/loja-do-painel.ts";

/**
 * Estoque, variações e opções dos produtos da loja (card #52). Com
 * `?recorte=estoque|variacoes|opcoes` e a consulta, uma página só (card #76).
 */
export async function GET(requisicao: Request) {
  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;
  const { token } = sessao;
  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(sessao.apelido)}/catalogo/visao-geral${new URL(requisicao.url).search}`,
    {
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
