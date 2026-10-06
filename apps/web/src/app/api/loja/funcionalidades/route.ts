/**
 * Repasse das funcionalidades da loja do dono (T-207, AC-212):
 * `GET /api/loja/funcionalidades` → `GET /v1/lojas/:apelido/funcionalidades`.
 *
 * Só leitura, e só com a sessão do dono: o token sai do cookie httpOnly
 * (P-008) e quem decide se a pessoa é da loja é a API. A resposta nunca vai
 * para cache — a administração pode ter acabado de desligar ou religar.
 *
 * A loja ainda é a de desenvolvimento, como no resto do painel, até a loja
 * da sessão chegar (LAC-02).
 */
import { enderecoDaApi } from "../../../../server/api-client.ts";
import { lerTokenDeAcessoDoCookie } from "../../../../server/session-cookie.ts";

const APELIDO_DA_LOJA_DE_DESENVOLVIMENTO =
  process.env.NEXT_PUBLIC_DEV_STORE_SLUG ?? "pastelaria-da-vila";

export async function GET(requisicao: Request): Promise<Response> {
  const token = lerTokenDeAcessoDoCookie(requisicao.headers.get("cookie"));
  if (token === undefined) {
    return Response.json(
      { erro: "nao_autenticado" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  let resposta: Response;
  try {
    resposta = await fetch(
      `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(APELIDO_DA_LOJA_DE_DESENVOLVIMENTO)}/funcionalidades`,
      {
        cache: "no-store",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
        },
      },
    );
  } catch {
    return Response.json(
      { erro: "indisponivel" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  return new Response(await resposta.text(), {
    status: resposta.status,
    headers: {
      "cache-control": "no-store",
      "content-type":
        resposta.headers.get("content-type") ?? "application/json",
    },
  });
}
