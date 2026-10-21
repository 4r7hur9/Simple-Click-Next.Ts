/**
 * O dono abre outra loja (card #32): leva o formulário a `POST /v1/auth/lojas`
 * com o token do cookie. A loja nasce aguardando aprovação e a API devolve uma
 * sessão nova; aqui ela vira cookies HttpOnly, e a página só recebe o endereço
 * da loja criada. Recusas (`limite_atingido`, `apelido_em_uso`) passam como a
 * API as deu, sem token.
 */
import { chamarIdentidade, valorDoSetCookie } from "../../../../server/chamada-de-identidade.ts";
import { responderSessaoDoNavegador } from "../../../../server/sessao.ts";
import { lerTokenDeAcessoDoCookie } from "../../../../server/session-cookie.ts";

function json(status: number, corpo: Record<string, unknown>): Response {
  return Response.json(corpo, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(requisicao: Request): Promise<Response> {
  const token = lerTokenDeAcessoDoCookie(requisicao.headers.get("cookie"));
  if (token === undefined) return json(401, { erro: "nao_autenticado" });

  let corpo: unknown;
  try {
    corpo = await requisicao.json();
  } catch {
    return json(400, { erro: "entrada_invalida" });
  }

  let resposta;
  try {
    resposta = await chamarIdentidade("/lojas", requisicao, corpo, {
      extras: { tokenDeAcesso: token },
    });
  } catch {
    return json(503, { erro: "indisponivel" });
  }

  const recebido = resposta.corpo;
  if (resposta.status === 201 && recebido["status"] === "SESSAO_CRIADA") {
    const tokenDeAcesso = recebido["tokenDeAcesso"];
    const acessoExpiraEm = recebido["acessoExpiraEm"];
    const tokenDeRenovacao =
      typeof recebido["tokenDeRenovacao"] === "string"
        ? recebido["tokenDeRenovacao"]
        : valorDoSetCookie(resposta.setCookies, "sc_refresh");
    if (
      typeof tokenDeAcesso !== "string" ||
      typeof acessoExpiraEm !== "string" ||
      tokenDeRenovacao === undefined
    ) {
      return json(502, { erro: "resposta_invalida" });
    }
    return responderSessaoDoNavegador(
      { tokenDeAcesso, tokenDeRenovacao, acessoExpiraEm },
      process.env,
      { loja: recebido["loja"], mensagem: recebido["mensagem"] },
      201,
    );
  }

  const { tokenDeAcesso: _a, tokenDeRenovacao: _r, ...semTokens } = recebido;
  return json(resposta.status, semTokens);
}
