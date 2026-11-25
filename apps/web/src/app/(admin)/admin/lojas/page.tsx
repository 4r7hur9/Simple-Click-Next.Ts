/**
 * Lojas da plataforma: lista, busca, filtros e aprovação (AC-206, card #29).
 *
 * A página é a moldura; a lista busca, filtra e pagina. Quem decide se a
 * pessoa pode ver as lojas é a API, com a credencial própria da administração.
 * A consulta mora no endereço (`?situacao=PENDING_APPROVAL`), por isso a lista
 * é montada dentro de `Suspense`.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ListaLojas } from "../../../../features/admin/ListaLojas.tsx";
import { exigirAdministracaoDaPlataforma } from "../../../../server/acesso-da-administracao.ts";

export const metadata = { title: "Lojas | Administração SimpleClick" };

export default async function PaginaDeLojas({
  searchParams,
}: {
  readonly searchParams?: Promise<
    Record<string, string | string[] | undefined>
  >;
} = {}) {
  await exigirAdministracaoDaPlataforma("/admin/lojas");
  // As pendentes têm tela própria (card #170): o endereço antigo leva a ela.
  if ((await searchParams)?.situacao === "PENDING_APPROVAL") {
    redirect("/admin/aprovacoes");
  }
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 pb-12 sm:px-8 sm:pt-10 sm:pb-16">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-3xl">
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
            Lojas
          </h1>
          <p className="mt-3 text-lg leading-8 text-[var(--cor-tinta-suave)]">
            Aprove as lojas novas e acompanhe todas as outras: situação, dono,
            pedidos e faturamento.
          </p>
        </div>
        <Link className="sc-botao sc-botao--primaria" href="/admin/lojas/nova">
          Nova loja
        </Link>
      </header>
      <Suspense fallback={null}>
        <ListaLojas />
      </Suspense>
    </div>
  );
}
