/**
 * Contas da plataforma na administração (card #29): donos com a quantidade de
 * lojas e o limite, e a equipe das lojas. A consulta mora no endereço
 * (`?tipo=equipe`), por isso a lista fica dentro de `Suspense`.
 */
import type { Metadata } from "next";
import { Suspense } from "react";

import { ListaDeContas } from "../../../../features/admin/ListaDeContas.tsx";

export const metadata: Metadata = {
  title: "Contas | Administração SimpleClick",
};

export default function PaginaDasContas() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 pb-12 sm:px-8 sm:pt-10 sm:pb-16">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria-texto)]">
          Administração da plataforma
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
          Contas
        </h1>
        <p className="mt-3 text-lg leading-8 text-[var(--cor-tinta-suave)]">
          Donos de loja e a equipe deles. Abra uma conta para ver as lojas e
          trocar o limite de lojas do dono.
        </p>
      </header>
      <Suspense fallback={null}>
        <ListaDeContas />
      </Suspense>
    </div>
  );
}
