/**
 * Encaminha um pedido da tela do painel para a API do catálogo do dono.
 *
 * A tela do dono fala com `/api/catalogo/...` do próprio site; o site lê o
 * token de acesso do cookie httpOnly (P-008: o script da página nunca o vê) e
 * repassa à API com o apelido da loja. Cada rota de encaminhamento repetia
 * essas trinta linhas; morando aqui, a regra de "sem sessão não passa" e a de
 * "resposta nunca vai para cache" são escritas uma vez só. A loja vem da
 * sessão (T-115, `loja-do-painel.ts`), nunca da configuração do servidor.
 */
import { enderecoDaApi } from "./api-client.ts";
import { sessaoParaEncaminhar } from "./loja-do-painel.ts";

/** Métodos que levam corpo JSON até a API. */
const COM_CORPO = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * @param requisicao o pedido que a tela fez ao site
 * @param caminho o trecho depois de `/catalogo/`, já com os identificadores
 *   codificados por quem chama
 */
export async function encaminharAoPainel(
  requisicao: Request,
  caminho: string,
): Promise<Response> {
  const sessao = await sessaoParaEncaminhar(requisicao);
  if (sessao instanceof Response) return sessao;
  const { token } = sessao;

  const leva = COM_CORPO.has(requisicao.method);
  const corpo = leva ? await requisicao.text() : "";
  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(sessao.apelido)}/catalogo/${caminho}`,
    {
      method: requisicao.method,
      cache: "no-store",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        origin: new URL(requisicao.url).origin,
        ...(leva ? { "content-type": "application/json" } : {}),
      },
      ...(leva ? { body: corpo === "" ? "{}" : corpo } : {}),
    },
  );

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
