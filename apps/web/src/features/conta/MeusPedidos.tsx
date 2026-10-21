/**
 * A lista de pedidos da conta do cliente, agrupada por loja (AC-616).
 *
 * Recebe a leitura pronta e só desenha: o que aparece vem do contrato, e a
 * regra de agrupar mora em `lib`. Três dos quatro estados vivem aqui — erro,
 * vazio e sucesso (P-011); o de espera é o `loading.tsx` da rota, que o
 * framework mostra enquanto a página pede à API.
 */
import Link from "next/link";
import { Erro, IconeLoja, Selo, Vazio, type TomDeSelo } from "@simpleclick/ui";
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
  /** A lista chegou filtrada: "nenhum pedido" vira "nenhum com esses filtros". */
  readonly filtrada?: boolean | undefined;
}

/** Onde o detalhe de um pedido da conta mora. */
export function caminhoDoMeuPedido(pedidoId: string): string {
  return `/conta/pedidos/${encodeURIComponent(pedidoId)}`;
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

/** O tom do selo de status: o texto diz o status, a cor só reforça. */
export function tomDoStatus(status: string): TomDeSelo {
  switch (status) {
    case "COMPLETED":
      return "sucesso";
    case "CANCELLED":
      return "erro";
    case "PENDING":
      return "atencao";
    default:
      return "info";
  }
}

function CartaoDoPedido({
  pedido,
}: {
  readonly pedido: PedidoDaContaNoContrato;
}) {
  return (
    <li
      className="sc-pedidos__pedido"
      data-pedido={pedido.id}
      data-status={pedido.status}
    >
      <div className="sc-pedidos__topo">
        <p className="sc-pedidos__numero">Pedido nº {pedido.numero}</p>
        <Selo tom={tomDoStatus(pedido.status)}>
          {rotuloDoStatus(pedido.status)}
        </Selo>
      </div>
      <p className="sc-pedidos__resumo">
        <time dateTime={pedido.criadoEm}>{quando(pedido.criadoEm)}</time>
        {" · "}
        {itens(pedido.quantidadeDeItens)}
        {" · "}
        <span className="sc-pedidos__total" data-total>
          {escreverDinheiro(pedido.totalCentavos)}
        </span>
      </p>
      <div className="sc-minha-conta__acao">
        <Link className="sc-pedidos__ver" href={caminhoDoMeuPedido(pedido.id)}>
          Ver o pedido nº {pedido.numero}
        </Link>
        <Link
          className="sc-pedidos__ver"
          href={`/loja/${encodeURIComponent(pedido.loja.apelido)}/cardapio`}
        >
          Pedir de novo
        </Link>
      </div>
    </li>
  );
}

export function MeusPedidos({ leitura, filtrada = false }: MeusPedidosProps) {
  if (leitura.estado === "indisponivel") {
    return (
      <Erro
        titulo="Não deu para carregar seus pedidos"
        mensagem="Tente de novo em instantes. Seus pedidos continuam guardados."
        acao={
          <Link
            className="sc-botao sc-botao--secundaria"
            href="/conta/pedidos"
          >
            Tentar de novo
          </Link>
        }
      />
    );
  }

  if (leitura.pedidos.length === 0 && filtrada) {
    return (
      <Vazio
        titulo="Nenhum pedido com esses filtros"
        descricao="Tire algum filtro para ver mais pedidos."
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
    <div className="sc-pedidos" data-meus-pedidos>
      {agruparPedidosPorLoja(leitura.pedidos).map((grupo) => (
        <section
          key={grupo.apelido}
          aria-labelledby={`loja-${grupo.apelido}`}
          data-loja={grupo.apelido}
        >
          <h2 id={`loja-${grupo.apelido}`} className="sc-pedidos__loja">
            <span className="sc-pedidos__loja-icone" aria-hidden="true">
              <IconeLoja />
            </span>
            {grupo.nome}
          </h2>
          <ol className="sc-pedidos__lista">
            {grupo.pedidos.map((pedido) => (
              <CartaoDoPedido key={pedido.id} pedido={pedido} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
