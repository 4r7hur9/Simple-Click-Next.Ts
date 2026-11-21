/**
 * A loja do painel para as páginas do servidor (T-115, AC-135, AC-136; card
 * #170, T-6).
 *
 * Mesma decisão de `loja-do-painel.ts` (`decidirLoja`), lida da resposta de
 * `GET /v1/eu` do pedido em curso (`euDoPedidoAtual`, uma leitura só por
 * pedido). Quem não tem loja para usar não vê a página, e o servidor o leva
 * para onde a pessoa resolve isso, sem 404:
 *
 * - sem sessão: `/entrar`, voltando para `/painel` (só o caminho);
 * - conta sem loja: a área do próprio papel (administrador, `/admin`;
 *   cliente, `/explorar/produtos`), pela lista fixa de `area-do-papel.ts`;
 * - escolha guardada que não vale mais (loja inexistente OU de outra pessoa,
 *   o site não diz qual) e uma só loja na sessão: `/escolher-loja/propria`
 *   regrava a escolha com a loja da própria conta e abre o painel, com aviso;
 * - escolha pendente ou inválida com várias lojas: `/escolher-loja`, sempre
 *   o mesmo endereço e o mesmo texto;
 * - API fora do ar: o painel fecha e `/escolher-loja` explica a falha.
 *
 * `decidirLoja` e `sessaoParaEncaminhar` seguem como estavam: as rotas de API
 * do painel continuam respondendo 409 `loja_nao_escolhida`.
 *
 * `cache` do React faz a casca e a página do mesmo pedido perguntarem à API
 * uma vez só.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import {
  decidirArea,
  DESTINO_DO_PAPEL,
  enderecoParaEntrar,
} from "./area-do-papel.ts";
import { euDoPedidoAtual } from "./eu-do-pedido.ts";
import {
  CAMINHO_DA_ESCOLHA_DE_LOJA,
  decidirLoja,
  lerCookieDaLoja,
  type LojaDoPainel,
} from "./loja-do-painel.ts";

/** O início do painel: para onde volta quem entra pedindo o painel. */
export const CAMINHO_DO_PAINEL = "/painel";

/** Regrava a escolha com a única loja da sessão e abre o painel dela. */
export const CAMINHO_DA_LOJA_PROPRIA = "/escolher-loja/propria";

/** A decisão da loja para o pedido em curso, sem redirecionar. */
export const lojaDoPedidoAtual = cache(async (): Promise<LojaDoPainel> => {
  const leitura = await euDoPedidoAtual();
  if (leitura.estado === "sem-sessao") return { estado: "sem-sessao" };
  if (leitura.estado === "indisponivel") return { estado: "indisponivel" };
  const cabecalhos = await headers();
  return decidirLoja(
    leitura.token,
    leitura.eu,
    lerCookieDaLoja(cabecalhos.get("cookie")),
  );
});

/** A loja pronta para uso, ou redireciona para onde a pessoa resolve isso. */
export async function exigirLojaDaPagina(): Promise<
  Extract<LojaDoPainel, { estado: "pronta" }>
> {
  const decisao = await lojaDoPedidoAtual();
  if (decisao.estado === "pronta") return decisao;
  if (decisao.estado === "sem-sessao") {
    redirect(enderecoParaEntrar(CAMINHO_DO_PAINEL));
  }
  if (decisao.estado === "sem-loja") {
    const area = decidirArea("painel", await euDoPedidoAtual());
    redirect(area.acao === "ir" ? area.destino : DESTINO_DO_PAPEL.cliente);
  }
  if (
    decisao.estado === "escolher" &&
    decisao.escolhaInvalida &&
    decisao.lojas.length === 1
  ) {
    redirect(CAMINHO_DA_LOJA_PROPRIA);
  }
  redirect(CAMINHO_DA_ESCOLHA_DE_LOJA);
}
