/**
 * Encaminha um pedido da tela para a API da loja ou da conta (T-700 a T-707).
 *
 * O MESMO MOLDE DE `encaminhar-ao-painel.ts`, para os caminhos que não são do
 * catálogo: os clientes da loja, o pedido manual e os endereços da conta. O
 * site lê o token de acesso do cookie httpOnly (P-008: o script da página
 * nunca o vê) e repassa à API; sem sessão, nem chega a pedir. A resposta nunca
 * vai para cache — é a lista de clientes de agora, e não a de minutos atrás.
 */
import { enderecoDaApi } from "./api-client.ts";
import { lerTokenDeAcessoDoCookie } from "./session-cookie.ts";

const APELIDO_DA_LOJA =
  process.env.NEXT_PUBLIC_DEV_STORE_SLUG ?? "pastelaria-da-vila";

/** Métodos que levam corpo JSON até a API. */
const COM_CORPO = new Set(["POST", "PUT", "PATCH"]);

async function encaminhar(
  requisicao: Request,
  destino: string,
): Promise<Response> {
  const token = lerTokenDeAcessoDoCookie(requisicao.headers.get("cookie"));
  if (token === undefined) {
    return Response.json({ erro: "nao_autenticado" }, { status: 401 });
  }

  const leva = COM_CORPO.has(requisicao.method);
  const corpo = leva ? await requisicao.text() : "";
  const consulta = new URL(requisicao.url).search;
  const resposta = await fetch(`${enderecoDaApi()}${destino}${consulta}`, {
    method: requisicao.method,
    cache: "no-store",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      origin: new URL(requisicao.url).origin,
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
export function encaminharALoja(
  requisicao: Request,
  caminho: string,
): Promise<Response> {
  return encaminhar(
    requisicao,
    `/v1/lojas/${encodeURIComponent(APELIDO_DA_LOJA)}/${caminho}`,
  );
}

/** Para `/v1/conta/{caminho}`: a área da pessoa, sem loja nenhuma. */
export function encaminharAConta(
  requisicao: Request,
  caminho: string,
): Promise<Response> {
  return encaminhar(requisicao, `/v1/conta/${caminho}`);
}
