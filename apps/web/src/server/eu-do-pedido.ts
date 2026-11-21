/**
 * Quem é a pessoa do pedido em curso: UMA leitura de `GET /v1/eu` por
 * requisição (card #170, T-6; revisão de arquitetura 9).
 *
 * As guardas de `/admin`, `/painel`, `/explorar` e `/conta` decidem a área da
 * pessoa pelo que a API diz AGORA (grant de administração e lojas da conta,
 * lidos ao vivo), e não pelo claim do JWT: revogar o grant, ou desativar a
 * conta, vale na hora. Antes cada guarda fazia a própria pergunta; agora todas
 * passam por aqui, e o `cache` do React faz layout e página do mesmo pedido
 * dividirem a mesma resposta.
 *
 * Três resultados, e só três:
 * - `sem-sessao`: sem cookie de acesso (e aí nem há chamada à API), ou 401
 *   (token vencido, conta desativada ou anonimizada);
 * - `indisponivel`: qualquer outra coisa (5xx, rede fora, tempo esgotado,
 *   JSON ou campo que não bate com o contrato). Quem chama decide se fecha
 *   (`/admin`, `/painel`) ou abre (`/explorar`, `/conta`) nesse caso;
 * - `ok`: a resposta conferida pelo contrato, com o token que a obteve.
 *
 * Só o servidor chega aqui: o token vem do cookie HttpOnly e nunca sai.
 */
import { esquemaDoEu, type EuNoContrato } from "@simpleclick/contracts";
import { headers } from "next/headers";
import { cache } from "react";

import { enderecoDaApi } from "./api-client.ts";
import { lerTokenDeAcessoDoCookie } from "./session-cookie.ts";

/** A guarda não segura a página para sempre: passou disso, `indisponivel`. */
export const ESPERA_MAXIMA_DO_EU_EM_MS = 2500;

/** O que o site sabe de quem pediu a página. */
export type EuDoPedido =
  | {
      readonly estado: "ok";
      readonly token: string;
      readonly eu: EuNoContrato;
    }
  | { readonly estado: "sem-sessao" }
  | { readonly estado: "indisponivel" };

/**
 * Pergunta à API quem é a pessoa dos cookies recebidos. Função de rede sem
 * `headers()`, para ser provada sem o Next.
 */
export async function lerEuDosCookies(
  cabecalhoCookie: string | null,
  buscar: typeof fetch = fetch,
): Promise<EuDoPedido> {
  const token = lerTokenDeAcessoDoCookie(cabecalhoCookie);
  if (token === undefined) return { estado: "sem-sessao" };
  try {
    const resposta = await buscar(`${enderecoDaApi()}/v1/eu`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(ESPERA_MAXIMA_DO_EU_EM_MS),
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
    });
    if (resposta.status === 401) return { estado: "sem-sessao" };
    if (!resposta.ok) return { estado: "indisponivel" };
    const lido = esquemaDoEu.safeParse(await resposta.json());
    return lido.success
      ? { estado: "ok", token, eu: lido.data }
      : { estado: "indisponivel" };
  } catch {
    return { estado: "indisponivel" };
  }
}

/** Uma pergunta por requisição, por mais guardas e telas que a usem. */
export const euDoPedidoAtual = cache(async (): Promise<EuDoPedido> =>
  lerEuDosCookies((await headers()).get("cookie")),
);
