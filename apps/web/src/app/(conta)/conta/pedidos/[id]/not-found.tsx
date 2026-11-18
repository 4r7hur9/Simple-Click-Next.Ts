import Link from "next/link";

import { PaginaDaConta } from "../../../../../features/conta/PaginaDaConta.tsx";

/**
 * Pedido não encontrado (card #111, AC-11108). Pedido de outra pessoa e
 * pedido que não existe caem aqui, na MESMA tela: ela não diz se o pedido
 * existe, para o endereço não servir de pergunta.
 */
export default function PedidoDaContaNaoEncontrado() {
  return (
    <PaginaDaConta
      atual="pedidos"
      titulo="Pedido não encontrado"
      descricao="Este pedido não está na sua conta. Confira se você abriu o link certo, ou veja a lista dos seus pedidos."
    >
      <p className="sc-minha-conta__acao">
        <Link className="sc-botao sc-botao--secundaria" href="/conta/pedidos">
          Ver meus pedidos
        </Link>
      </p>
    </PaginaDaConta>
  );
}
