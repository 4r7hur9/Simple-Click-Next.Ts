/**
 * O usuário da barra para o pedido em curso, lido no SERVIDOR: a barra sai
 * pronta no HTML, sem piscar "Entrar" antes de mostrar o nome.
 *
 * Sem cookie de acesso não há chamada nenhuma à API (o visitante não paga por
 * isso). API fora do ar, token vencido ou resposta estranha: visitante.
 */
import { headers } from "next/headers";
import { cache } from "react";

import { enderecoDaApi } from "./api-client.ts";
import { lerCookieDaLoja } from "./loja-do-painel.ts";
import { lerTokenDeAcessoDoCookie } from "./session-cookie.ts";
import {
  usuarioDoEu,
  VISITANTE,
  type UsuarioDaBarra,
} from "../lib/quem-esta-logado.ts";

/** A barra não segura a página: passou disso, mostra visitante. */
const ESPERA_MAXIMA_EM_MS = 2500;

/** Pergunta à API quem é a pessoa dos cookies recebidos. */
export async function usuarioDosCookies(
  cabecalhoCookie: string | null,
  buscar: typeof fetch = fetch,
): Promise<UsuarioDaBarra> {
  const token = lerTokenDeAcessoDoCookie(cabecalhoCookie);
  if (token === undefined) return VISITANTE;
  try {
    const resposta = await buscar(`${enderecoDaApi()}/v1/eu`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(ESPERA_MAXIMA_EM_MS),
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
    });
    if (!resposta.ok) return VISITANTE;
    return usuarioDoEu(await resposta.json(), lerCookieDaLoja(cabecalhoCookie));
  } catch {
    return VISITANTE;
  }
}

/** Uma pergunta por pedido, mesmo que a barra apareça em mais de um lugar. */
export const usuarioDoPedidoAtual = cache(async (): Promise<UsuarioDaBarra> =>
  usuarioDosCookies((await headers()).get("cookie")),
);
