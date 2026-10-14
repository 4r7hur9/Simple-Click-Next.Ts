/**
 * A ficha de uma loja na administração (AC-207).
 *
 * A página é a moldura; a ficha busca, mostra e salva. Quem decide se a pessoa
 * pode ver a ficha é a API, com a credencial própria da administração — e
 * cada abertura fica na trilha de auditoria (AC-118).
 */
import Link from "next/link";

import { FichaLoja } from "../../../../../features/admin/FichaLoja.tsx";

export const metadata = { title: "Ficha da loja | Administração SimpleClick" };

interface ParametrosDaPagina {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function PaginaDaFicha({ params }: ParametrosDaPagina) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        className="text-sm font-medium text-[var(--cor-primaria-texto)]"
        href="/admin/lojas"
      >
        ← Voltar para as lojas
      </Link>
      <FichaLoja lojaId={id} />
    </div>
  );
}
