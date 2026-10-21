import { enderecoDaApi } from "../../../../../../../server/api-client.ts";
import { sessaoParaEncaminhar } from "../../../../../../../server/loja-do-painel.ts";
import { renovarAposGravar } from "../../../../../../../server/renovar-vitrine.ts";

/**
 * Envio do ARQUIVO da foto do produto (T-303, AC-306).
 *
 * O corpo são bytes, e não JSON: por isso esta rota não usa o encaminhamento
 * comum do painel, que lê o corpo como texto e estragaria a imagem. A
 * conferência do conteúdo acontece na API — esta rota só leva os bytes, a
 * sessão e as opções da consulta (principal, texto alternativo).
 */
export async function POST(
  requisicao: Request,
  contexto: { params: Promise<{ produtoId: string }> },
): Promise<Response> {
  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;
  const { token } = sessao;
  const { produtoId } = await contexto.params;
  const consulta = new URL(requisicao.url).search;
  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(sessao.apelido)}/catalogo/produtos/${encodeURIComponent(produtoId)}/imagens/arquivo${consulta}`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        origin: new URL(requisicao.url).origin,
        "content-type":
          requisicao.headers.get("content-type") ?? "application/octet-stream",
      },
      body: await requisicao.arrayBuffer(),
    },
  );
  const corpo = await resposta.text();
  // A vitrine esquece a foto de antes: a nova aparece ao recarregar.
  renovarAposGravar(sessao.apelido, requisicao.method, resposta.status);
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
