"use client";

/**
 * O pedido aberto em janela, por cima do quadro (ou da ficha do cliente):
 * itens, opções, observação, endereço, cliente, linha do tempo e imprimir.
 *
 * É o mesmo `DetalheDoPedido` da página `/painel/pedidos/[id]`, só que sem a
 * troca de página: quem olha o quadro abre, confere e fecha sem perder o dia
 * que estava vendo.
 */
import { DetalheDoPedido } from "./DetalheDoPedido.tsx";
import { JanelaModal } from "./JanelaModal.tsx";

export interface JanelaDoPedidoProps {
  /** O pedido aberto, ou `null` com a janela fechada. */
  readonly pedidoId: string | null;
  readonly numero?: number | undefined;
  readonly aoFechar: () => void;
  /** O pedido mudou de status lá dentro. */
  readonly aoMudar?: (() => void) | undefined;
  readonly buscar?: typeof fetch | undefined;
}

export function JanelaDoPedido({
  pedidoId,
  numero,
  aoFechar,
  aoMudar,
  buscar,
}: JanelaDoPedidoProps) {
  return (
    <JanelaModal
      aberta={pedidoId !== null}
      aoFechar={aoFechar}
      titulo={numero === undefined ? "Pedido" : `Pedido #${numero}`}
      acoes={
        pedidoId === null ? null : (
          // `<a>` comum, e não `Link`: abrir o cupom emite uma via, e
          // pré-carregar contaria via que nunca saiu no papel.
          <a
            className="sc-botao sc-botao--secundaria sc-botao--pequeno"
            href={`/imprimir/${encodeURIComponent(pedidoId)}`}
            target="_blank"
            rel="noopener"
          >
            Imprimir cupom
          </a>
        )
      }
    >
      {pedidoId === null ? null : (
        <DetalheDoPedido
          key={pedidoId}
          pedidoId={pedidoId}
          embutido
          aoMudar={aoMudar}
          {...(buscar === undefined ? {} : { buscar })}
        />
      )}
    </JanelaModal>
  );
}
