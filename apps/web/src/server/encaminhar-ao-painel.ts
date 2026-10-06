/**
 * Encaminha um pedido da tela do painel para a API do catálogo do dono.
 *
 * A tela do dono fala com `/api/catalogo/...` do próprio site; o site lê o
 * token de acesso do cookie httpOnly (P-008: o script da página nunca o vê) e
 * repassa à API com o apelido da loja. Cada rota de encaminhamento repetia
 * essas trinta linhas; morando aqui, a regra de "sem sessão não passa" e a de
 * "resposta nunca vai para cache" são escritas uma vez só.
 */
import { enderecoDaApi } from "./api-client.ts";
import { lerTokenDeAcessoDoCookie } from "./session-cookie.ts";

const APELIDO_DA_LOJA =
  process.env.NEXT_PUBLIC_DEV_STORE_SLUG ?? "pastelaria-da-vila";

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
  const token = lerTokenDeAcessoDoCookie(requisicao.headers.get("cookie"));
  if (token === undefined) {
    return Response.json({ erro: "nao_autenticado" }, { status: 401 });
  }

  const leva = COM_CORPO.has(requisicao.method);
  const corpo = leva ? await requisicao.text() : "";
  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(APELIDO_DA_LOJA)}/catalogo/${caminho}`,
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

/**
 * Cabeçalhos da API que a tela precisa receber de volta numa leitura: o tipo,
 * o nome do arquivo de uma planilha baixada e quantas linhas ela traz.
 */
const DEVOLVIDOS_NA_LEITURA = [
  "content-type",
  "content-disposition",
  "x-quantidade-de-pedidos",
] as const;

/**
 * Encaminha uma LEITURA do painel para uma rota da loja na API, com a
 * consulta do jeito que chegou (as métricas: T-803, T-804, T-808).
 *
 * A consulta não é filtrada aqui, de propósito: quem decide o que ela aceita
 * é a borda da API, que recusa chave desconhecida com 400 (AC-811). Filtrar
 * no site trocaria a recusa por um silêncio — e a tentativa de pedir a loja
 * de outra pessoa deixaria de ser negada para ser só ignorada.
 *
 * @param requisicao o pedido que a tela fez ao site
 * @param caminhoNaLoja o trecho depois de `/v1/lojas/:apelido/`
 */
export async function encaminharLeituraDaLoja(
  requisicao: Request,
  caminhoNaLoja: string,
): Promise<Response> {
  const token = lerTokenDeAcessoDoCookie(requisicao.headers.get("cookie"));
  if (token === undefined) {
    return Response.json({ erro: "nao_autenticado" }, { status: 401 });
  }

  const endereco = new URL(requisicao.url);
  const resposta = await fetch(
    `${enderecoDaApi()}/v1/lojas/${encodeURIComponent(APELIDO_DA_LOJA)}/${caminhoNaLoja}${endereco.search}`,
    {
      method: "GET",
      cache: "no-store",
      headers: {
        accept: requisicao.headers.get("accept") ?? "application/json",
        authorization: `Bearer ${token}`,
        origin: endereco.origin,
      },
    },
  );

  const cabecalhos = new Headers({ "cache-control": "no-store" });
  for (const nome of DEVOLVIDOS_NA_LEITURA) {
    const valor = resposta.headers.get(nome);
    if (valor !== null) cabecalhos.set(nome, valor);
  }
  // Em bytes, e não em texto: a planilha começa com a marca de codificação, e
  // é ela que faz o programa de planilha ler o acento certo.
  const corpo = await resposta.arrayBuffer();
  return new Response(corpo.byteLength === 0 ? null : corpo, {
    status: resposta.status,
    headers: cabecalhos,
  });
}
