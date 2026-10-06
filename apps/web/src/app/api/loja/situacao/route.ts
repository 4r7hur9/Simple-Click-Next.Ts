/**
 * Repasse do aviso de suspensão do painel (AC-209):
 * `GET /api/loja/situacao` → `GET /v1/lojas/:apelido/situacao`.
 *
 * Só leitura, e só com a sessão do dono: o token sai do cookie httpOnly
 * (P-008) e quem decide se a pessoa é da loja é a API. A resposta nunca vai
 * para cache — a suspensão pode ter acabado de acontecer, ou de acabar.
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
      `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(sessao.apelido)}/situacao`,
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
