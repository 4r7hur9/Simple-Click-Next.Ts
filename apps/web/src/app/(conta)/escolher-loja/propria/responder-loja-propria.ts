/**
 * Regrava a escolha da loja com a ÚNICA loja da conta (card #170, T-6, D-10).
 *
 * Quem tem um cookie `sc_loja` que não vale mais (a loja saiu da conta, foi
 * encerrada ou é de outra pessoa que usou o mesmo navegador) e só uma loja na
 * sessão não precisa escolher nada: aqui o cookie é regravado com a loja da
 * própria sessão e o painel abre com um aviso (`?loja=trocada`).
 *
 * Nada do pedido escolhe a loja: nem o endereço, nem o cookie antigo. O
 * apelido gravado sai da resposta de `GET /v1/eu`, e só quando há exatamente
 * uma loja. Em qualquer outro caso o pedido segue para onde a pessoa resolve:
 * sem sessão, `/entrar`; várias lojas ou API fora do ar, `/escolher-loja`
 * (sempre o mesmo endereço); nenhuma loja, a área do papel.
 *
 * Mora fora de `route.ts` porque arquivo de rota do Next só exporta verbos
 * HTTP, e a regra precisa de prova sem servidor.
 */
import {
  decidirArea,
  DESTINO_DO_PAPEL,
  enderecoParaEntrar,
} from "../../../../server/area-do-papel.ts";
import { lerEuDosCookies } from "../../../../server/eu-do-pedido.ts";
import { CAMINHO_DO_PAINEL } from "../../../../server/loja-da-pagina.ts";
import {
  CAMINHO_DA_ESCOLHA_DE_LOJA,
  DURACAO_DO_COOKIE_DA_LOJA_EM_SEGUNDOS,
  NOME_DO_COOKIE_DA_LOJA,
} from "../../../../server/loja-do-painel.ts";

/** O painel depois da troca: o aviso aparece só com este valor exato. */
export const CONSULTA_DA_LOJA_TROCADA = "loja=trocada";

/** Redireciona sem cache, com o cookie da loja se houver. */
function irPara(
  requisicao: Request,
  destino: string,
  cookie?: string,
): Response {
  const cabecalhos = new Headers({
    location: new URL(destino, requisicao.url).toString(),
    "cache-control": "no-store",
  });
  if (cookie !== undefined) cabecalhos.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers: cabecalhos });
}

/** O cookie da loja, com os mesmos atributos da escolha feita na tela. */
function cookieDaLoja(apelido: string): string {
  return [
    `${NOME_DO_COOKIE_DA_LOJA}=${encodeURIComponent(apelido)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${DURACAO_DO_COOKIE_DA_LOJA_EM_SEGUNDOS}`,
  ].join("; ");
}

/** Atende `GET /escolher-loja/propria`. `buscar` entra para a prova. */
export async function responderLojaPropria(
  requisicao: Request,
  buscar: typeof fetch = fetch,
): Promise<Response> {
  const leitura = await lerEuDosCookies(
    requisicao.headers.get("cookie"),
    buscar,
  );
  if (leitura.estado === "sem-sessao") {
    return irPara(requisicao, enderecoParaEntrar(CAMINHO_DO_PAINEL));
  }
  if (leitura.estado === "indisponivel") {
    return irPara(requisicao, CAMINHO_DA_ESCOLHA_DE_LOJA);
  }

  const lojas = leitura.eu.lojasDaConta ?? leitura.eu.lojas;
  const [unica] = lojas;
  if (unica === undefined) {
    const area = decidirArea("painel", leitura);
    return irPara(
      requisicao,
      area.acao === "ir" ? area.destino : DESTINO_DO_PAPEL.cliente,
    );
  }
  if (lojas.length > 1) return irPara(requisicao, CAMINHO_DA_ESCOLHA_DE_LOJA);

  return irPara(
    requisicao,
    `${CAMINHO_DO_PAINEL}?${CONSULTA_DA_LOJA_TROCADA}`,
    cookieDaLoja(unica.apelido),
  );
}
