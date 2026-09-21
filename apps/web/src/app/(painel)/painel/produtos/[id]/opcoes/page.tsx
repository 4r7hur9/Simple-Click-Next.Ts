import Link from "next/link";

import { EditorGrupoOpcao } from "../../../../../../features/painel-catalogo/EditorGrupoOpcao.tsx";

export const metadata = { title: "Escolhas do produto | SimpleClick" };

export default async function PaginaDeOpcoes({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Link
        className="text-sm font-semibold text-[var(--cor-primaria)]"
        href={`/painel/produtos/${id}`}
      >
        ← Voltar ao produto
      </Link>
      <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em]">
        Escolhas do produto
      </h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--cor-tinta-suave)]">
        Configure sabores, ingredientes e adicionais. O cliente verá os grupos e
        o carrinho recalculará os acréscimos no servidor.
      </p>
      <EditorGrupoOpcao produtoId={id} />
    </div>
  );
}
