import { enderecoDaApi } from "../../../../../../../server/api-client.ts";
import { sessaoParaEncaminhar } from "../../../../../../../server/loja-do-painel.ts";
import { renovarAposGravar } from "../../../../../../../server/renovar-vitrine.ts";

async function encaminhar(
  requisicao: Request,
  produtoId: string,
  imagemId: string,
) {
  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;
  const { token } = sessao;
  const corpo =
    requisicao.method === "PATCH" ? await requisicao.text() : undefined;
  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(sessao.apelido)}/catalogo/produtos/${encodeURIComponent(produtoId)}/imagens/${encodeURIComponent(imagemId)}`,
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
  // A vitrine esquece a foto de antes: a nova aparece ao recarregar.
  renovarAposGravar(sessao.apelido, requisicao.method, resposta.status);
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

export function PATCH(
  requisicao: Request,
  contexto: { params: Promise<{ produtoId: string; imagemId: string }> },
) {
  return contexto.params.then(({ produtoId, imagemId }) =>
    encaminhar(requisicao, produtoId, imagemId),
  );
}

export function DELETE(
  requisicao: Request,
  contexto: { params: Promise<{ produtoId: string; imagemId: string }> },
) {
  return contexto.params.then(({ produtoId, imagemId }) =>
    encaminhar(requisicao, produtoId, imagemId),
  );
}
