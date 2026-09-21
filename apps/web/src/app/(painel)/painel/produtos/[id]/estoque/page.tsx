"use client";

import Link from "next/link";
import { use } from "react";

import { AjusteDeEstoque } from "../../../../../../features/painel-catalogo/AjusteDeEstoque.tsx";

interface Props {
  readonly params: Promise<{ id: string }>;
}

export default function PaginaDeEstoque({ params }: Props) {
  const { id } = use(params);
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Link
        className="text-sm font-semibold text-[var(--cor-primaria)]"
        href={`/painel/produtos/${id}`}
      >
        ← Voltar ao produto
      </Link>
      <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em]">
        Estoque do produto
      </h1>
      <AjusteDeEstoque produtoId={id} />
    </div>
  );
}
