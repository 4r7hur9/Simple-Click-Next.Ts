/**
 * Quem está comprando: a conta logada, de qualquer papel (AC-616).
 *
 * O fechamento do pedido sai do NAVEGADOR direto para a API (o carrinho é do
 * cookie `sc_carrinho`, que só a API lê). A página não alcança o token de
 * acesso — ele mora no cookie HttpOnly `sc_access`, que o site grava no
 * domínio comum de site e API — e por isso não monta `Authorization`. Sem
 * ler esse cookie aqui, toda compra feita pelo site seria de convidado e
 * "Meus pedidos" ficaria vazio para quem comprou logado.
 *
 * O cabeçalho Bearer continua valendo e vem primeiro (cliente nativo). O
 * pedido EXIGE conta: sem nenhum dos dois, o fechamento responde 401
 * `conta_obrigatoria`. A rota segue atrás da lista fechada de origens
 * (`core/cors.ts`) e do `SameSite=Lax` do próprio cookie.
 */
import type { Request } from "express";

import { lerCookies } from "../../core/sessao-do-carrinho.ts";
import {
  tokenDoCabecalhoDeAutorizacao,
  verificarTokenDeAcesso,
} from "./token.ts";

/** O mesmo nome que o site usa (`apps/web/src/server/session-cookie.ts`). */
export const NOME_DO_COOKIE_DE_ACESSO = "sc_access";

/** A identidade da conta logada, ou `null` (sem sessão ou token ruim). */
export function clienteDaCompra(
  requisicao: Request,
  segredo: string | undefined,
): { readonly identidadeId: string } | null {
  if (segredo === undefined || segredo === "") return null;

  // Cookie malformado (`%` solto) faz a leitura lançar: vira convidado.
  try {
    const token =
      tokenDoCabecalhoDeAutorizacao(requisicao.headers.authorization) ??
      lerCookies(requisicao.headers.cookie).get(NOME_DO_COOKIE_DE_ACESSO);
    if (token === undefined || token === "") return null;
    const alegacoes = verificarTokenDeAcesso(token, segredo);
    // A mesma conta serve a todos: dono e administração também compram.
    return { identidadeId: alegacoes.identidadeId };
  } catch {
    return null;
  }
}
