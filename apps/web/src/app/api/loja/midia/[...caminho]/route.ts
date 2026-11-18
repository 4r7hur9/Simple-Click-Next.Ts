/**
 * Mídia da loja no painel (card #48): galeria do produto (fotos e vídeos),
 * vídeos, capa do vídeo e stories de 24 horas — contrato do card #46.
 *
 * Encaminha para `/v1/lojas/<loja da sessão>/<caminho>` só os caminhos que a
 * tela usa (a lista abaixo), com os BYTES como chegaram: o vídeo, a capa e o
 * story são o arquivo cru no corpo, e quem confere se é vídeo ou foto é a
 * API, pelos bytes. `limites` vai para `GET /v1/midia/limites` (público).
 *
 * As rotas /api não passam pelo proxy do Next (`src/proxy.ts`), que cortaria
 * o corpo acima de 10 MB; o vídeo chega a 50 MB.
 */
import { enderecoDaApi } from "../../../../../server/api-client.ts";
import { sessaoParaEncaminhar } from "../../../../../server/loja-do-painel.ts";
import { recusarOrigemDeFora } from "../../../../../server/protecao-da-conta.ts";
import { renovarAposGravar } from "../../../../../server/renovar-vitrine.ts";

const UUID = "[0-9a-fA-F-]{36}";

/** Método → caminhos (depois de `/v1/lojas/:apelido/`) que a tela pode usar. */
const PERMITIDOS: Readonly<Record<string, readonly RegExp[]>> = {
  GET: [new RegExp(`^catalogo/produtos/${UUID}/midias$`), /^stories$/],
  PUT: [new RegExp(`^catalogo/produtos/${UUID}/midias/ordem$`)],
  POST: [
    new RegExp(`^catalogo/produtos/${UUID}/videos$`),
    new RegExp(`^catalogo/produtos/${UUID}/videos/${UUID}/capa$`),
    /^stories$/,
  ],
  DELETE: [
    new RegExp(`^catalogo/produtos/${UUID}/videos/${UUID}$`),
    new RegExp(`^stories/${UUID}$`),
  ],
};

/** Trava do encaminhamento: acima disto nem vale a ida à API. */
const MAXIMO_ENCAMINHADO_EM_BYTES = 60 * 1024 * 1024;

function responder(resposta: Response, corpo: string): Response {
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

async function encaminhar(
  requisicao: Request,
  contexto: { params: Promise<{ caminho: string[] }> },
): Promise<Response> {
  const caminho = (await contexto.params).caminho.join("/");
  const consulta = new URL(requisicao.url).search;

  if (requisicao.method === "GET" && caminho === "limites") {
    const resposta = await fetch(`${enderecoDaApi()}/v1/midia/limites`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    return responder(resposta, await resposta.text());
  }

  const permitidos = PERMITIDOS[requisicao.method] ?? [];
  if (!permitidos.some((padrao) => padrao.test(caminho))) {
    return Response.json({ erro: "nao_encontrado" }, { status: 404 });
  }

  // Card #134: o corpo é o arquivo cru (não JSON); só a origem é conferida.
  const recusada = recusarOrigemDeFora(requisicao);
  if (recusada !== null) return recusada;

  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;

  const comCorpo = requisicao.method === "POST" || requisicao.method === "PUT";
  const bytes = comCorpo ? await requisicao.arrayBuffer() : undefined;
  if (bytes !== undefined && bytes.byteLength > MAXIMO_ENCAMINHADO_EM_BYTES) {
    return Response.json(
      { erro: "arquivo_grande_demais", mensagem: "O arquivo passa do limite." },
      { status: 413 },
    );
  }

  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(sessao.apelido)}/${caminho}${consulta}`,
    {
      method: requisicao.method,
      cache: "no-store",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${sessao.token}`,
        origin: new URL(requisicao.url).origin,
        ...(bytes === undefined
          ? {}
          : {
              "content-type":
                requisicao.headers.get("content-type") ??
                "application/octet-stream",
            }),
      },
      ...(bytes === undefined ? {} : { body: bytes }),
    },
  );
  const corpoDevolvido = await resposta.text();
  // Vídeo, ordem e capa do produto aparecem na vitrine; stories não.
  if (caminho.startsWith("catalogo/")) {
    renovarAposGravar(sessao.apelido, requisicao.method, resposta.status);
  }
  return responder(resposta, corpoDevolvido);
}

export { encaminhar as GET, encaminhar as POST, encaminhar as PUT, encaminhar as DELETE };
