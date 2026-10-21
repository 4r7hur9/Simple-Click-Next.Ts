import { enderecoDaApi } from "../../../../../../../../server/api-client.ts";
import { sessaoParaEncaminhar } from "../../../../../../../../server/loja-do-painel.ts";
import { renovarAposGravar } from "../../../../../../../../server/renovar-vitrine.ts";

/**
 * Troca do ARQUIVO de uma foto que já está no produto: a foto mantém o lugar,
 * o texto e o "é a capa", e só a imagem muda. O corpo são os bytes, como no
 * envio novo (`../../arquivo`); quem confere o conteúdo é a API.
 */
export async function PUT(
  requisicao: Request,
  contexto: { params: Promise<{ produtoId: string; imagemId: string }> },
): Promise<Response> {
  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;
  const { produtoId, imagemId } = await contexto.params;
  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(sessao.apelido)}/catalogo/produtos/${encodeURIComponent(produtoId)}/imagens/${encodeURIComponent(imagemId)}/arquivo`,
    {
      method: "PUT",
      cache: "no-store",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${sessao.token}`,
        origin: new URL(requisicao.url).origin,
        "content-type":
          requisicao.headers.get("content-type") ?? "application/octet-stream",
      },
      body: await requisicao.arrayBuffer(),
    },
  );
  const corpo = await resposta.text();
  renovarAposGravar(sessao.apelido, "PUT", resposta.status);
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
