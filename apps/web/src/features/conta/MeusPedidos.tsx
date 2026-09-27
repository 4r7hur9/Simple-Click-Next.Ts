/**
 * A lista de pedidos da conta do cliente, agrupada por loja (AC-616).
 *
 * Recebe a leitura pronta e só desenha: o que aparece vem do contrato, e a
 * regra de agrupar mora em `lib`. Três dos quatro estados vivem aqui — erro,
 * vazio e sucesso (P-011); o de espera é o `loading.tsx` da rota, que o
 * framework mostra enquanto a página pede à API.
 */
import Link from "next/link";
import { Erro, Vazio } from "@simpleclick/ui";
import type { PedidoDaContaNoContrato } from "@simpleclick/contracts";

import {
  agruparPedidosPorLoja,
  type LeituraDosMeusPedidos,
} from "../../lib/meus-pedidos.ts";
import { escreverDinheiro } from "../../lib/produto.ts";
import { rotuloDoStatus } from "../pedido/LinhaDoTempo.tsx";

/** O que a página entrega: quem não está logado nem chega a esta lista. */
export type EstadoDosMeusPedidos = Exclude<
  LeituraDosMeusPedidos,
  { estado: "nao-autenticado" }
>;

export interface MeusPedidosProps {
  readonly leitura: EstadoDosMeusPedidos;
}

/** Onde o detalhe de um pedido da conta mora. */
export function caminhoDoMeuPedido(pedidoId: string): string {
  return `/minha-conta/pedidos/${encodeURIComponent(pedidoId)}`;
}

function quando(data: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(data));
}

function itens(quantidade: number): string {
  return quantidade === 1 ? "1 item" : `${quantidade} itens`;
}

function CartaoDoPedido({
  pedido,
}: {
  readonly pedido: PedidoDaContaNoContrato;
}) {
  return (
    <li
      className="rounded-2xl border border-[var(--cor-borda)] bg-[var(--cor-superficie)] p-4"
      data-pedido={pedido.id}
      data-status={pedido.status}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">Pedido nº {pedido.numero}</p>
        <p className="rounded-full bg-[var(--cor-primaria-suave)] px-3 py-1 text-sm font-semibold text-[var(--cor-primaria-texto)]">
          {rotuloDoStatus(pedido.status)}
        </p>
      </div>
      <p className="mt-1 text-sm text-[var(--cor-tinta-suave)]">
        <time dateTime={pedido.criadoEm}>{quando(pedido.criadoEm)}</time>
        {" · "}
        {itens(pedido.quantidadeDeItens)}
        {" · "}
        <span data-total>{escreverDinheiro(pedido.totalCentavos)}</span>
      </p>
      <Link
        className="mt-3 inline-block font-medium text-[var(--cor-primaria-texto)] underline"
        href={caminhoDoMeuPedido(pedido.id)}
      >
        Ver o pedido nº {pedido.numero}
      </Link>
    </li>
  );
}

export function MeusPedidos({ leitura }: MeusPedidosProps) {
  if (leitura.estado === "indisponivel") {
    return (
      <Erro
        titulo="Não deu para carregar seus pedidos"
        mensagem="Tente de novo em instantes. Seus pedidos continuam guardados."
        acao={
          <Link
            className="sc-botao sc-botao--secundario"
            href="/minha-conta/pedidos"
          >
            Tentar de novo
          </Link>
        }
      />
    );
  }

  if (leitura.pedidos.length === 0) {
    return (
      <Vazio
        titulo="Você ainda não fez nenhum pedido"
        descricao="Quando você comprar em uma loja estando na sua conta, o pedido aparece aqui — sem precisar guardar o link."
      />
    );
  }

  return (
    <div className="space-y-10" data-meus-pedidos>
      {agruparPedidosPorLoja(leitura.pedidos).map((grupo) => (
        <section
          key={grupo.apelido}
          aria-labelledby={`loja-${grupo.apelido}`}
          data-loja={grupo.apelido}
        >
          <h2 id={`loja-${grupo.apelido}`} className="text-xl font-semibold">
            {grupo.nome}
          </h2>
          <ol className="mt-4 space-y-3">
            {grupo.pedidos.map((pedido) => (
              <CartaoDoPedido key={pedido.id} pedido={pedido} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
