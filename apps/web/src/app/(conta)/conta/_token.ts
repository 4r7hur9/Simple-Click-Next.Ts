import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { NOME_DO_COOKIE_DE_ACESSO } from "../../../server/session-cookie.ts";

/** O token da sessão do cliente; sem ele, a pessoa vai entrar. */
export async function tokenOuEntrar(): Promise<string> {
  const token = (await cookies()).get(NOME_DO_COOKIE_DE_ACESSO)?.value;
  if (token === undefined || token === "") redirect("/entrar");
  return token;
}
