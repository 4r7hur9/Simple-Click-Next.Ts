import "@simpleclick/ui/styles/pedidos.css";

import Link from "next/link";

import { ListaClientes } from "../../../../features/painel-clientes/ListaClientes.tsx";

export const metadata = { title: "Clientes | SimpleClick" };

export default function PaginaDeClientes() {
  return (
    <div className="sc-pedidos sc-pedidos--respiro">
      <header className="sc-pedidos__cabeca">
        <p className="sc-pedidos__sobretitulo">Clientes da loja</p>
        <h1 className="sc-pedidos__titulo">Quem compra com você</h1>
        <p className="sc-pedidos__descricao">
          Veja quem já comprou, quanto e quando foi a última vez — e cadastre
          quem pede pelo telefone ou no balcão.
        </p>
        <Link
          className="sc-botao sc-botao--secundaria justify-self-start"
          href="/painel/clientes/importar"
        >
          Importar clientes
        </Link>
      </header>
      <ListaClientes />
    </div>
  );
}
