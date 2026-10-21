import "@simpleclick/ui/styles/pedidos.css";

import Link from "next/link";
import { IconeVoltar } from "@simpleclick/ui";

import { ImportadorDeClientes } from "../../../../../features/painel-clientes/importacao/ImportadorDeClientes.tsx";

export const metadata = { title: "Importar clientes | SimpleClick" };

export default function PaginaDeImportarClientes() {
  return (
    <div className="sc-pedidos sc-pedidos--respiro">
      <Link
        className="sc-botao sc-botao--discreta sc-botao--pequeno sc-pedidos__voltar"
        href="/painel/clientes"
      >
        <IconeVoltar aria-hidden="true" />
        Voltar para os clientes
      </Link>
      <header className="sc-pedidos__cabeca">
        <p className="sc-pedidos__sobretitulo">Clientes da loja</p>
        <h1 className="sc-pedidos__titulo">Importar clientes</h1>
        <p className="sc-pedidos__descricao">
          Traga de uma vez a lista que você já tem — planilha do Excel, do
          Google Planilhas ou contatos exportados. Nada é gravado antes de você
          revisar.
        </p>
      </header>
      <ImportadorDeClientes />
    </div>
  );
}
