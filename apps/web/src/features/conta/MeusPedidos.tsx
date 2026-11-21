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
import { codigoDoPedido } from "@simpleclick/contracts";

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
      className={
        pedido.status === "CANCELLED"
          ? "sc-meus-pedidos__pedido sc-meus-pedidos__pedido--cancelado"
          : "sc-meus-pedidos__pedido"
      }
      data-pedido={pedido.id}
      data-status={pedido.status}
    >
      <div className="sc-meus-pedidos__topo">
        <p className="sc-meus-pedidos__numero">Pedido {codigoDoPedido(pedido.numero)}</p>
        <Selo tom={tomDoStatus(pedido.status)}>
          {rotuloDoStatus(pedido.status)}
        </Selo>
      </div>
      <p className="sc-meus-pedidos__resumo">
        <time dateTime={pedido.criadoEm}>{quando(pedido.criadoEm)}</time>
        {" · "}
        {itens(pedido.quantidadeDeItens)}
        {" · "}
        <span className="sc-meus-pedidos__total" data-total>
          {escreverDinheiro(pedido.totalCentavos)}
        </span>
      </p>
      <div className="sc-minha-conta__acao">
        <Link className="sc-meus-pedidos__ver" href={caminhoDoMeuPedido(pedido.id)}>
          Ver o pedido {codigoDoPedido(pedido.numero)}
        </Link>
        <Link
          className="sc-meus-pedidos__ver"
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
        acao={
          <Link className="sc-botao sc-botao--primaria" href="/explorar">
            Explorar lojas
          </Link>
        }
      />
    );
  }

  return (
    <div className="sc-meus-pedidos" data-meus-pedidos>
      {agruparPedidosPorLoja(leitura.pedidos).map((grupo) => (
        <section
          key={grupo.apelido}
          aria-labelledby={`loja-${grupo.apelido}`}
          data-loja={grupo.apelido}
        >
          <h3 id={`loja-${grupo.apelido}`} className="sc-meus-pedidos__loja">
            <span className="sc-meus-pedidos__loja-icone" aria-hidden="true">
              <IconeLoja />
            </span>
            {grupo.nome}
          </h3>
          <ol className="sc-meus-pedidos__lista">
            {grupo.pedidos.map((pedido) => (
              <CartaoDoPedido key={pedido.id} pedido={pedido} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
