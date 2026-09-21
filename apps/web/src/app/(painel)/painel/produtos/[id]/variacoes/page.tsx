"use client";

import Link from "next/link";
import { use } from "react";

import { GradeDeVariacoes } from "../../../../../../features/painel-catalogo/GradeDeVariacoes.tsx";

interface Props {
  readonly params: Promise<{ id: string }>;
}

export default function PaginaDeVariacoes({ params }: Props) {
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
        Variações do produto
      </h1>
      <p className="mt-3 max-w-2xl text-[var(--cor-tinta-suave)]">
        Monte a grade com as combinações que têm preço, SKU e disponibilidade
        próprios.
      </p>
      <GradeDeVariacoes produtoId={id} />
    </div>
  );
}
