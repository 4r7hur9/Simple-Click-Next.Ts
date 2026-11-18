/**
 * A loja em análise, pelo dono (card #28):
 *
 * - `GET  /api/loja/aprovacao` lê os dados da loja em análise
 *   (`GET /v1/auth/lojas/:apelido`);
 * - `PUT  /api/loja/aprovacao` corrige os dados da loja da sessão
 *   (`PUT /v1/auth/lojas/:apelido`);
 * - `POST /api/loja/aprovacao` reenvia a loja recusada para nova análise
 *   (`POST /v1/auth/lojas/:apelido/reenviar`).
 *
 * O token sai do cookie httpOnly e a loja é a da sessão: o navegador nunca
 * escolhe de quem é a loja. Quem decide se a pessoa é dona é a API.
 */
import { enderecoDaApi } from "../../../../server/api-client.ts";
import { cabecalhosParaApi } from "../../../../server/chamada-de-identidade.ts";
import { sessaoParaEncaminhar } from "../../../../server/loja-do-painel.ts";
import { recusarAcaoDeFora } from "../../../../server/protecao-da-conta.ts";

async function encaminhar(
  requisicao: Request,
  metodo: "GET" | "PUT" | "POST",
): Promise<Response> {
  // Card #134: escrita de outro site, ou corpo que não é JSON, para aqui.
  const recusada = await recusarAcaoDeFora(requisicao);
  if (recusada !== null) return recusada;

  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;
  const apelido = encodeURIComponent(sessao.apelido);
  const corpo = metodo === "PUT" ? await requisicao.text() : undefined;
  try {
    const resposta = await fetch(
      `${enderecoDaApi()}/v1/auth/lojas/${apelido}${metodo === "POST" ? "/reenviar" : ""}`,
      {
        method: metodo,
        cache: "no-store",
        headers: cabecalhosParaApi(requisicao, { tokenDeAcesso: sessao.token }),
        ...(corpo === undefined ? {} : { body: corpo }),
      },
    );
    return new Response(await resposta.text(), {
      status: resposta.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { erro: "indisponivel" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}

export function GET(requisicao: Request): Promise<Response> {
  return encaminhar(requisicao, "GET");
}

export function PUT(requisicao: Request): Promise<Response> {
  return encaminhar(requisicao, "PUT");
}

export function POST(requisicao: Request): Promise<Response> {
  return encaminhar(requisicao, "POST");
}
