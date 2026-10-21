import type { Metadata } from "next";

import { PainelDaEquipe } from "../../../../features/equipe/PainelDaEquipe.tsx";

export const metadata: Metadata = { title: "Equipe | SimpleClick" };

export default function PaginaDaEquipe() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria-texto)]">
          Equipe da loja
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
          Quem trabalha com você
        </h1>
        <p className="mt-4 text-lg leading-8 text-[var(--cor-tinta-suave)]">
          Dê acesso a quem atende pedidos e cuida do catálogo, sem abrir as
          configurações da loja.
        </p>
      </header>
      <div className="mt-10">
        <PainelDaEquipe />
      </div>
    </main>
  );
}
