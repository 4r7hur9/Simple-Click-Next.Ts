/**
 * Quais tutoriais de primeiro acesso a conta da sessão já viu ou pulou
 * (card #39), lido no SERVIDOR: a página já chega sabendo se o tutorial abre
 * sozinho, sem pedir nada do navegador antes.
 *
 * Na dúvida (sem sessão, API fora, resposta estranha) responde "já viu": um
 * tutorial que não abre sozinho é só um item no menu; um que abre em toda
 * visita porque a API piscou incomoda de verdade.
 */
import { headers } from "next/headers";
import { cache } from "react";

import { enderecoDaApi } from "./api-client.ts";
import { lerTokenDeAcessoDoCookie } from "./session-cookie.ts";

/** "cliente", "dono" ou "equipe" (o tipo mora em `features/tutorial`). */
type PapelDoTutorial = string;

const ESPERA_MAXIMA_EM_MS = 2000;

export async function tutorialJaVisto(
  papel: PapelDoTutorial,
  cabecalhoCookie: string | null,
  buscar: typeof fetch = fetch,
): Promise<boolean> {
  const token = lerTokenDeAcessoDoCookie(cabecalhoCookie);
  if (token === undefined) return true;
  try {
    const resposta = await buscar(`${enderecoDaApi()}/v1/conta/tutorial`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(ESPERA_MAXIMA_EM_MS),
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
    });
    if (!resposta.ok) return true;
    const corpo: unknown = await resposta.json();
    const vistos =
      typeof corpo === "object" && corpo !== null && "vistos" in corpo
        ? corpo.vistos
        : null;
    return !Array.isArray(vistos) || vistos.includes(papel);
  } catch {
    return true;
  }
}

/** Uma pergunta por pedido e papel. */
export const tutorialJaVistoNestePedido = cache(
  async (papel: PapelDoTutorial): Promise<boolean> =>
    tutorialJaVisto(papel, (await headers()).get("cookie")),
);
