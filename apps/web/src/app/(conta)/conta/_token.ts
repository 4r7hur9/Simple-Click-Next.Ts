import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { comDestino } from "../../../lib/destino-seguro.ts";
import { NOME_DO_COOKIE_DE_ACESSO } from "../../../server/session-cookie.ts";

/**
 * O token da sessão do cliente; sem ele, a pessoa vai entrar e, depois,
 * volta à página que tentou abrir (`caminho`: o layout do App Router não
 * conhece a página filha, então cada página passa o próprio).
 */
export async function tokenOuEntrar(caminho: string): Promise<string> {
  const token = (await cookies()).get(NOME_DO_COOKIE_DE_ACESSO)?.value;
  if (token === undefined || token === "") redirect(comDestino("/entrar", caminho));
  return token;
}
