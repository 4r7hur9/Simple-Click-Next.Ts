/**
 * Lojas da plataforma: lista e busca (AC-206).
 *
 * A página é a moldura; a lista busca, filtra e pagina. Quem decide se a
 * pessoa pode ver as lojas é a API, com a credencial própria da administração.
 */
import Link from "next/link";

import { ListaLojas } from "../../../../features/admin/ListaLojas.tsx";

export const metadata = { title: "Lojas | Administração SimpleClick" };

export default function PaginaDeLojas() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria-texto)]">
            Administração da plataforma
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            Lojas
          </h1>
          <p className="mt-3 text-lg leading-8 text-[var(--cor-tinta-suave)]">
            Encontre qualquer cadastro pelo nome, pelo CPF ou CNPJ ou pelo
            código de atendimento.
          </p>
        </div>
        <Link className="sc-botao sc-botao--primaria" href="/admin/lojas/nova">
          Nova loja
        </Link>
      </header>
      <ListaLojas />
    </div>
  );
}
