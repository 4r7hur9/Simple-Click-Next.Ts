/**
 * Ponte do site até as rotas da administração da API (`/v1/admin/*`).
 *
 * As telas da administração chamam `/api/admin/...` no próprio site, e esta
 * camada de servidor repassa à API com o token que só ela lê (do cookie
 * httpOnly — P-008). A página nunca vê token nenhum.
 *
 * A LISTA DE CAMINHOS É FECHADA. Um repasse que aceitasse qualquer caminho
 * viraria um proxy aberto para a API inteira, com o cookie de quem está logado:
 * bastaria um link malicioso para uma tela da administração chamar uma rota
 * que ninguém planejou expor por aqui. Caminho fora da lista é 404, antes de
 * sair qualquer requisição.
 *
 * Esta ponte NÃO autoriza nada: quem decide se a pessoa é administradora é a
 * API, com duas travas e a credencial própria do banco.
 */

import { enderecoDaApi } from "./api-client.ts";
import { lerTokenDeAcessoDoCookie } from "./session-cookie.ts";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Os únicos caminhos repassados, e com quais métodos. */
export const CAMINHOS_DA_ADMINISTRACAO: readonly {
  readonly padrao: RegExp;
  readonly metodos: readonly string[];
}[] = [
  { padrao: /^tipos-de-negocio$/, metodos: ["GET"] },
  { padrao: /^lojas$/, metodos: ["GET", "POST"] },
  { padrao: new RegExp(`^lojas/${UUID}$`), metodos: ["GET", "PATCH"] },
  // A troca do tipo de negócio (T-203, AC-214).
  {
    padrao: new RegExp(`^lojas/${UUID}/tipo-de-negocio$`),
    metodos: ["PUT"],
  },
];

/** Cabeçalhos da requisição que seguem para a API. Nenhum outro. */
const CABECALHOS_REPASSADOS = ["content-type", "x-nome-do-arquivo"];

function respostaJson(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

/** O caminho está na lista, com este método? */
export function caminhoPermitido(caminho: string, metodo: string): boolean {
  return CAMINHOS_DA_ADMINISTRACAO.some(
    (permitido) =>
      permitido.padrao.test(caminho) && permitido.metodos.includes(metodo),
  );
}

/**
 * Repassa a requisição da tela para a API.
 *
 * `buscar` entra por parâmetro para a prova responder sem rede.
 */
export async function encaminharParaAdministracao(
  requisicao: Request,
  partes: readonly string[],
  buscar: typeof fetch = fetch,
): Promise<Response> {
  const caminho = partes.map((parte) => encodeURIComponent(parte)).join("/");
  const metodo = requisicao.method.toUpperCase();
  if (!caminhoPermitido(caminho, metodo)) {
    return respostaJson(404, { erro: "nao_encontrado" });
  }

  const token = lerTokenDeAcessoDoCookie(requisicao.headers.get("cookie"));
  if (token === undefined) {
    return respostaJson(401, { erro: "nao_autenticado" });
  }

  const cabecalhos = new Headers({
    accept: "application/json",
    authorization: `Bearer ${token}`,
    // A API confere a lista fechada de origens antes de toda escrita.
    origin: requisicao.headers.get("origin") ?? new URL(requisicao.url).origin,
  });
  for (const nome of CABECALHOS_REPASSADOS) {
    const valor = requisicao.headers.get(nome);
    if (valor !== null) cabecalhos.set(nome, valor);
  }

  const consulta = new URL(requisicao.url).search;
  const temCorpo = metodo !== "GET" && metodo !== "HEAD";

  let resposta: Response;
  try {
    resposta = await buscar(
      `${enderecoDaApi()}/v1/admin/${caminho}${consulta}`,
      {
        method: metodo,
        cache: "no-store",
        headers: cabecalhos,
        ...(temCorpo ? { body: await requisicao.arrayBuffer() } : {}),
      },
    );
  } catch {
    return respostaJson(503, { erro: "indisponivel" });
  }

  const corpo = await resposta.arrayBuffer();
  return new Response(corpo.byteLength === 0 ? null : corpo, {
    status: resposta.status,
    headers: {
      "cache-control": "no-store",
      "content-type":
        resposta.headers.get("content-type") ?? "application/json",
    },
  });
}
