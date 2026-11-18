import "@simpleclick/ui/styles/vitrine.css";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { AcompanhamentoDoPedido } from "../../../../../features/pedido/AcompanhamentoDoPedido.tsx";
import { buscarMeuPedido } from "../../../../../lib/meus-pedidos.ts";
import { NOME_DO_COOKIE_DE_ACESSO } from "../../../../../server/session-cookie.ts";
import { comDestino } from "../../../../../lib/destino-seguro.ts";

interface ParametrosDaPagina {
  readonly params: Promise<{ readonly id: string }>;
}

export const metadata: Metadata = {
  title: "Meu pedido | SimpleClick",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

/**
 * O detalhe de um pedido da conta (AC-616): a MESMA página do link público,
 * aberta pelo identificador em vez do link.
 *
 * A API diz de qual loja é o pedido e qual é o endereço público dele; daí em
 * diante a página é a do acompanhamento (T-603), com a cor da loja e a
 * atualização sozinha a cada poucos segundos. Um pedido de outra pessoa, ou
 * que não existe, é "não encontrado" — a API não distingue os dois, e a
 * página também não.
 */
export default async function PaginaDoMeuPedido({
  params,
}: ParametrosDaPagina) {
  const { id } = await params;
  const token = (await cookies()).get(NOME_DO_COOKIE_DE_ACESSO)?.value;
  const aqui = `/conta/pedidos/${encodeURIComponent(id)}`;
  if (token === undefined || token === "") redirect(comDestino("/entrar", aqui));

  const leitura = await buscarMeuPedido(id, token);
  if (leitura.estado === "nao-autenticado") redirect(comDestino("/entrar", aqui));
  if (leitura.estado === "nao-encontrado") notFound();
  if (leitura.estado === "indisponivel") {
    throw new Error(`pedido da conta indisponível: ${leitura.motivo}`);
  }

  const { detalhe } = leitura;

  return (
    <AcompanhamentoDoPedido
      apelidoDaLoja={detalhe.loja.apelido}
      tokenDoPedido={detalhe.tokenPublico}
      inicial={detalhe.pedido}
      voltar={{ href: "/conta/pedidos", rotulo: "← Meus pedidos" }}
    />
  );
}
