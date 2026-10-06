/**
 * A loja do painel para as páginas do servidor (T-115, AC-135, AC-136).
 *
 * Mesma decisão de `loja-do-painel.ts`, lida dos cabeçalhos do pedido em
 * curso. Quem não tem loja para usar não vê a página: sem sessão vai para a
 * entrada; escolha pendente, escolha que deixou de valer, conta sem loja ou
 * API fora do ar vão para a escolha da loja, que explica cada caso.
 *
 * `cache` do React faz a casca e a página do mesmo pedido perguntarem à API
 * uma vez só.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import {
  CAMINHO_DA_ESCOLHA_DE_LOJA,
  lojaDoPainel,
  type LojaDoPainel,
} from "./loja-do-painel.ts";

/** A decisão da loja para o pedido em curso, sem redirecionar. */
export const lojaDoPedidoAtual = cache(async (): Promise<LojaDoPainel> => {
  const cabecalhos = await headers();
  return lojaDoPainel(cabecalhos.get("cookie"));
});

/** A loja pronta para uso, ou redireciona para onde a pessoa resolve isso. */
export async function exigirLojaDaPagina(): Promise<
  Extract<LojaDoPainel, { estado: "pronta" }>
> {
  const decisao = await lojaDoPedidoAtual();
  if (decisao.estado === "pronta") return decisao;
  if (decisao.estado === "sem-sessao") redirect("/entrar");
  redirect(CAMINHO_DA_ESCOLHA_DE_LOJA);
}
