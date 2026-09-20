import Link from "next/link";

import { FormularioProduto } from "../../../../../features/painel-catalogo/FormularioProduto.tsx";

export const metadata = { title: "Novo produto | SimpleClick" };

export default function PaginaDeNovoProduto() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Link
        className="text-sm font-semibold text-[var(--cor-primaria)]"
        href="/painel/produtos"
      >
        ← Voltar aos produtos
      </Link>
      <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em]">
        Novo produto
      </h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--cor-tinta-suave)]">
        Comece com nome, categoria e preço. Imagens, opções e estoque entram nas
        próximas etapas do catálogo.
      </p>
      <FormularioProduto />
    </div>
  );
}
