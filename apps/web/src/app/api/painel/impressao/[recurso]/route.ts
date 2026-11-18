import { enderecoDaApi } from "../../../../../server/api-client.ts";
import { sessaoParaEncaminhar } from "../../../../../server/loja-do-painel.ts";
import { recusarOrigemDeFora } from "../../../../../server/protecao-da-conta.ts";

/**
 * A impressão automática do painel (T-608): o estado do agente, os cupons que
 * esperam por ele e o código de pareamento. O site lê o token de acesso do
 * cookie httpOnly (P-008) e o leva à API com o apelido da loja da sessão
 * (T-115, `sessaoParaEncaminhar`).
 *
 * Lista fechada de recurso e método: o que não está aqui responde 404 sem ir
 * à API.
 */
const RECURSOS: Readonly<Record<string, "GET" | "POST">> = {
  estado: "GET",
  pendentes: "GET",
  pareamento: "POST",
};

async function encaminhar(
  requisicao: Request,
  recurso: string,
): Promise<Response> {
  const recusada = recusarOrigemDeFora(requisicao);
  if (recusada !== null) return recusada;

  if (RECURSOS[recurso] !== requisicao.method) {
    return Response.json({ erro: "nao_encontrado" }, { status: 404 });
  }

  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;
  const { token } = sessao;

  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(sessao.apelido)}/impressao/${recurso}`,
    {
      method: requisicao.method,
      cache: "no-store",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        origin: new URL(requisicao.url).origin,
      },
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

export async function GET(
  requisicao: Request,
  contexto: { params: Promise<{ recurso: string }> },
): Promise<Response> {
  const { recurso } = await contexto.params;
  return encaminhar(requisicao, recurso);
}

export async function POST(
  requisicao: Request,
  contexto: { params: Promise<{ recurso: string }> },
): Promise<Response> {
  const { recurso } = await contexto.params;
  return encaminhar(requisicao, recurso);
}
