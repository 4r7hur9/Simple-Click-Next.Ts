/**
 * Encaminha um pedido da tela para a API da loja ou da conta (T-700 a T-707).
 *
 * O MESMO MOLDE DE `encaminhar-ao-painel.ts`, para os caminhos que não são do
 * catálogo: os clientes da loja, o pedido manual e os endereços da conta. O
 * site lê o token de acesso do cookie httpOnly (P-008: o script da página
 * nunca o vê) e repassa à API; sem sessão, nem chega a pedir. A resposta nunca
 * vai para cache — é a lista de clientes de agora, e não a de minutos atrás.
 * A loja vem da sessão (T-115, `loja-do-painel.ts`); a conta não tem loja.
 */
import { enderecoDaApi } from "./api-client.ts";
import { cabecalhosDaPonte, origemParaApi } from "./chamada-de-identidade.ts";
import { sessaoParaEncaminhar } from "./loja-do-painel.ts";
import { lerTokenDeAcessoDoCookie } from "./session-cookie.ts";
import { recusarAcaoDeFora } from "./protecao-da-conta.ts";

/** Métodos que levam corpo JSON até a API. */
const COM_CORPO = new Set(["POST", "PUT", "PATCH"]);

/** Repassa o pedido à API com o token da pessoa. */
async function encaminhar(
  requisicao: Request,
  token: string,
  destino: string,
): Promise<Response> {
  const recusada = await recusarAcaoDeFora(requisicao);
  if (recusada !== null) return recusada;

  const leva = COM_CORPO.has(requisicao.method);
  const corpo = leva ? await requisicao.text() : "";
  const consulta = new URL(requisicao.url).search;
  const resposta = await fetch(`${enderecoDaApi()}${destino}${consulta}`, {
    method: requisicao.method,
    cache: "no-store",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      // A origem que o navegador mandou (já conferida acima), como no cadastro:
      // atrás do proxy, `requisicao.url` traz o endereço interno do servidor,
      // que a lista fechada da API recusa.
      origin: origemParaApi(requisicao),
      // IP e navegador de quem pede (o aceite e os pedidos do titular gravam).
      ...cabecalhosDaPonte(requisicao),
      ...(leva ? { "content-type": "application/json" } : {}),
    },
    ...(leva ? { body: corpo === "" ? "{}" : corpo } : {}),
  });

  const devolvido = await resposta.text();
  const tipo = resposta.headers.get("content-type");
  return new Response(devolvido === "" ? null : devolvido, {
    status: resposta.status,
    headers: {
      "cache-control": "no-store",
      ...(tipo === null ? {} : { "content-type": tipo }),
    },
  });
}

/**
 * Para `/v1/lojas/{apelido}/{caminho}`.
 *
 * @param caminho o trecho depois do apelido, já com os identificadores
 *   codificados por quem chama — "clientes", "pedidos/manual".
 */
export async function encaminharALoja(
  requisicao: Request,
  caminho: string,
): Promise<Response> {
  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;
  return encaminhar(
    requisicao,
    sessao.token,
    `/v1/lojas/${encodeURIComponent(sessao.apelido)}/${caminho}`,
  );
}

/** Para `/v1/conta/{caminho}`: a área da pessoa, sem loja nenhuma. */
export async function encaminharAConta(
  requisicao: Request,
  caminho: string,
): Promise<Response> {
  const token = lerTokenDeAcessoDoCookie(requisicao.headers.get("cookie"));
  if (token === undefined) {
    return Response.json({ erro: "nao_autenticado" }, { status: 401 });
  }
  return encaminhar(requisicao, token, `/v1/conta/${caminho}`);
}
