"use server";

/**
 * Escolher a loja do painel (T-115, AC-136), como ação do servidor: o
 * formulário da tela de escolha funciona sem JavaScript e a escolha vai para
 * um cookie HttpOnly que o script da página não lê.
 *
 * A escolha só é aceita se a loja está na lista que a API devolve para a
 * sessão agora. Apelido de loja alheia volta para a tela com o aviso, e o
 * cookie fica como estava.
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  CAMINHO_DA_ESCOLHA_DE_LOJA,
  DURACAO_DO_COOKIE_DA_LOJA_EM_SEGUNDOS,
  lojaDoPainel,
  lojaEscolhivel,
  NOME_DO_COOKIE_DA_LOJA,
} from "../loja-do-painel.ts";

/** Guarda a loja escolhida e abre o painel dela. */
export async function escolherLojaDoPainel(dados: FormData): Promise<void> {
  const cabecalhos = await headers();
  const decisao = await lojaDoPainel(cabecalhos.get("cookie"));
  if (decisao.estado === "sem-sessao") redirect("/entrar");

  const loja = lojaEscolhivel(decisao, dados.get("apelido"));
  if (loja === null) redirect(`${CAMINHO_DA_ESCOLHA_DE_LOJA}?estado=recusada`);

  // Loja aguardando aprovação ou recusada não tem painel (card #32).
  if (loja.situacao === "PENDING_APPROVAL" || loja.situacao === "REJECTED") {
    redirect(`${CAMINHO_DA_ESCOLHA_DE_LOJA}?estado=aguardando`);
  }

  const armazenamento = await cookies();
  armazenamento.set({
    name: NOME_DO_COOKIE_DA_LOJA,
    value: loja.apelido,
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: DURACAO_DO_COOKIE_DA_LOJA_EM_SEGUNDOS,
  });
  redirect("/painel");
}
