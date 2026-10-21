/**
 * Moderação de comentários no painel (card #48), sobre o contrato do #47.
 *
 * Encaminha para `/v1/lojas/<loja da sessão>/comentarios/<caminho>` só o que
 * a tela usa: a lista (`?situacao=`), a contagem (selo do menu), aprovar,
 * recusar, apagar e a configuração "aprovar automaticamente". Quem decide se
 * a pessoa pode é a API (`moderar_comentarios`; a configuração, só o dono).
 */
import { enderecoDaApi } from "../../../../../server/api-client.ts";
import { sessaoParaEncaminhar } from "../../../../../server/loja-do-painel.ts";

const UUID = "[0-9a-fA-F-]{36}";

const PERMITIDOS: Readonly<Record<string, readonly RegExp[]>> = {
  GET: [/^$/, /^contagem$/, /^configuracao$/],
  PUT: [/^configuracao$/],
  POST: [new RegExp(`^${UUID}/(aprovar|recusar)$`)],
  DELETE: [new RegExp(`^${UUID}$`)],
};

async function encaminhar(
  requisicao: Request,
  contexto: { params: Promise<{ caminho?: string[] }> },
): Promise<Response> {
  const caminho = ((await contexto.params).caminho ?? []).join("/");
  const permitidos = PERMITIDOS[requisicao.method] ?? [];
  if (!permitidos.some((padrao) => padrao.test(caminho))) {
    return Response.json({ erro: "nao_encontrado" }, { status: 404 });
  }

  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;

  const corpo =
    requisicao.method === "POST" || requisicao.method === "PUT"
      ? await requisicao.text()
      : undefined;
  const consulta = new URL(requisicao.url).search;
  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(sessao.apelido)}/comentarios${caminho === "" ? "" : `/${caminho}`}${consulta}`,
    {
      method: requisicao.method,
      cache: "no-store",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${sessao.token}`,
        origin: new URL(requisicao.url).origin,
        ...(corpo === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(corpo === undefined ? {} : { body: corpo === "" ? "{}" : corpo }),
    },
  );
  const texto = await resposta.text();
  return new Response(texto === "" ? null : texto, {
    status: resposta.status,
    headers: {
      "cache-control": "no-store",
      ...(resposta.headers.get("content-type")
        ? { "content-type": resposta.headers.get("content-type")! }
        : {}),
    },
  });
}

export {
  encaminhar as GET,
  encaminhar as POST,
  encaminhar as PUT,
  encaminhar as DELETE,
};
