/**
 * Quantas lojas esperam a aprovação da administração, para o selo do menu
 * lateral (card #29). Lido no servidor, com o token do cookie; qualquer falha
 * (API fora do ar, sessão sem poder) vira zero, porque o menu não pode
 * derrubar a página por causa de um contador.
 */
import { headers } from "next/headers";

import { enderecoDaApi } from "./api-client.ts";
import { lerTokenDeAcessoDoCookie } from "./session-cookie.ts";

export async function lojasPendentesDeAprovacao(
  buscar: typeof fetch = fetch,
): Promise<number> {
  try {
    const token = lerTokenDeAcessoDoCookie((await headers()).get("cookie"));
    if (token === undefined) return 0;
    const resposta = await buscar(
      `${enderecoDaApi()}/v1/admin/lojas?situacao=PENDING_APPROVAL&porPagina=1`,
      {
        cache: "no-store",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(2000),
      },
    );
    if (!resposta.ok) return 0;
    const corpo = (await resposta.json()) as { total?: unknown };
    return typeof corpo.total === "number" && corpo.total > 0 ? corpo.total : 0;
  } catch {
    return 0;
  }
}
