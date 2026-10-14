import Link from "next/link";

import { ListaProdutos } from "../../../../features/painel-catalogo/ListaProdutos.tsx";

export const metadata = { title: "Produtos | SimpleClick" };

export default function PaginaDeProdutos() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria-texto)]">
            Catálogo da loja
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Cadastre o que você vende.
          </h1>
          <p className="mt-4 text-lg leading-8 text-[var(--cor-tinta-suave)]">
            Monte produtos simples, revise em rascunho e publique quando a
            vitrine estiver pronta.
          </p>
        </div>
        <Link
          className="sc-botao sc-botao--primaria"
          href="/painel/produtos/novo"
        >
          Novo produto
        </Link>
      </header>
      <ListaProdutos />
    </div>
  );
}
