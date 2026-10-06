/**
 * Repasse das funcionalidades da loja do dono (T-207, AC-212):
 * `GET /api/loja/funcionalidades` → `GET /v1/lojas/:apelido/funcionalidades`.
 *
 * Só leitura, e só com a sessão do dono: o token sai do cookie httpOnly
 * (P-008) e quem decide se a pessoa é da loja é a API. A resposta nunca vai
 * para cache — a administração pode ter acabado de desligar ou religar.
 *
 * A loja é a da sessão (T-115, `sessaoParaEncaminhar`), nunca a da
 * configuração do servidor.
 */
import { enderecoDaApi } from "../../../../server/api-client.ts";
import { sessaoParaEncaminhar } from "../../../../server/loja-do-painel.ts";

export async function GET(requisicao: Request): Promise<Response> {
  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;
  const { token } = sessao;

  let resposta: Response;
  try {
    resposta = await fetch(
      `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(sessao.apelido)}/funcionalidades`,
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
