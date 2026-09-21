import Link from "next/link";

import { EditorEspecificacoes } from "../../../../../../features/painel-catalogo/EditorEspecificacoes.tsx";

export const metadata = { title: "Especificações da categoria | SimpleClick" };

interface Props {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function PaginaDeEspecificacoes({ params }: Props) {
  const { id } = await params;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Link
        href="/painel/categorias"
        className="text-sm font-medium text-[var(--cor-primaria)]"
      >
        ← Voltar para categorias
      </Link>
      <header className="mt-8 max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
          Catálogo da loja
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Especificações da categoria
        </h1>
        <p className="mt-4 text-lg leading-8 text-[var(--cor-tinta-suave)]">
          Defina os campos que os produtos desta categoria devem preencher e os
          valores que podem ser usados para filtrar a vitrine.
        </p>
      </header>
      <EditorEspecificacoes categoriaId={id} />
    </div>
  );
}
