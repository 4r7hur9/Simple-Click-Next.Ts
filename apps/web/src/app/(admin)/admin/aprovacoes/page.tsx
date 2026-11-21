/**
 * Aprovações: as lojas que esperam a decisão da administração (card #170,
 * T-12). É a lista de lojas com a situação fixa em "pendentes"; aprovar e
 * recusar acontecem na linha. Quem pode ver é decidido pela guarda e pela API.
 */
import { Suspense } from "react";

import { ListaLojas } from "../../../../features/admin/ListaLojas.tsx";
import { exigirAdministracaoDaPlataforma } from "../../../../server/acesso-da-administracao.ts";

export const metadata = { title: "Aprovações | Administração SimpleClick" };

export default async function PaginaDeAprovacoes() {
  await exigirAdministracaoDaPlataforma("/admin/aprovacoes");
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 pb-12 sm:px-8 sm:pt-10 sm:pb-16">
      <header className="max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-[-0.04em]">
          Aprovações
        </h1>
        <p className="mt-3 text-lg leading-8 text-[var(--cor-tinta-suave)]">
          Lojas novas só entram no ar depois de aprovadas. Aprove ou recuse cada
          uma aqui.
        </p>
      </header>
      <Suspense fallback={null}>
        <ListaLojas modo="aprovacoes" />
      </Suspense>
    </div>
  );
}
