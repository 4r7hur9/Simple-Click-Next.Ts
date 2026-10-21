"use server";

/**
 * Depois que a conta foi excluída na API, apaga os cookies deste navegador e
 * leva a pessoa ao início (card #35). A API já encerrou todas as sessões.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  dominioDoCookieDeSessao,
  NOME_DO_COOKIE_DE_ACESSO,
  NOME_DO_COOKIE_DE_RENOVACAO,
} from "../session-cookie.ts";

export async function sairDepoisDeExcluirAConta(): Promise<void> {
  const armazenamento = await cookies();
  const dominio = dominioDoCookieDeSessao();
  for (const nome of [NOME_DO_COOKIE_DE_RENOVACAO, NOME_DO_COOKIE_DE_ACESSO]) {
    armazenamento.delete({
      name: nome,
      path: "/",
      ...(dominio === undefined ? {} : { domain: dominio }),
    });
  }
  redirect("/?conta=excluida");
}
