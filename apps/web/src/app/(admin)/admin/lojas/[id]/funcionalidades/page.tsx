/**
 * As funcionalidades liberadas de uma loja na administração (AC-212, AC-213).
 *
 * A página é a moldura; `FuncionalidadesDaLoja` busca, mostra e altera. Quem
 * decide se a pessoa alcança a loja é a API, com a credencial própria da
 * administração, e cada alteração vai para o histórico com o motivo.
 */
import Link from "next/link";

import { FuncionalidadesDaLoja } from "../../../../../../features/admin/FuncionalidadesDaLoja.tsx";

export const metadata = {
  title: "Funcionalidades liberadas | Administração SimpleClick",
};

interface ParametrosDaPagina {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function PaginaDasFuncionalidades({
  params,
}: ParametrosDaPagina) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        className="text-sm font-medium text-[var(--cor-primaria-texto)]"
        href={`/admin/lojas/${encodeURIComponent(id)}`}
      >
        ← Voltar para a ficha da loja
      </Link>
      <header className="mt-6 max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria-texto)]">
          Administração da plataforma
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
          Funcionalidades liberadas
        </h1>
      </header>
      <p className="mt-2 max-w-prose text-lg">
        O que esta loja usa da plataforma. Uma funcionalidade desligada some do
        painel do dono e deixa de responder, mesmo acessada pelo endereço.
      </p>
      <FuncionalidadesDaLoja lojaId={id} />
    </div>
  );
}
