import { enderecoDaApi } from "../../../../../server/api-client.ts";
import { lerTokenDeAcessoDoCookie } from "../../../../../server/session-cookie.ts";

/**
 * A impressão automática do painel (T-608): o estado do agente, os cupons que
 * esperam por ele e o código de pareamento. O site lê o token de acesso do
 * cookie httpOnly (P-008) e o leva à API com o apelido da loja.
 *
 * Lista fechada de recurso e método: o que não está aqui responde 404 sem ir
 * à API.
 */
const RECURSOS: Readonly<Record<string, "GET" | "POST">> = {
  estado: "GET",
  pendentes: "GET",
  pareamento: "POST",
};

const APELIDO_DA_LOJA =
  process.env.NEXT_PUBLIC_DEV_STORE_SLUG ?? "pastelaria-da-vila";

async function encaminhar(
  requisicao: Request,
  recurso: string,
): Promise<Response> {
  if (RECURSOS[recurso] !== requisicao.method) {
    return Response.json({ erro: "nao_encontrado" }, { status: 404 });
  }

  const token = lerTokenDeAcessoDoCookie(requisicao.headers.get("cookie"));
  if (token === undefined) {
    return Response.json({ erro: "nao_autenticado" }, { status: 401 });
  }

  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(APELIDO_DA_LOJA)}/impressao/${recurso}`,
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
