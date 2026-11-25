/**
 * Donos e equipes (card #170, T-10): o único lugar das ações de vínculo entre
 * pessoas e lojas. As fichas só linkam para cá, com `?loja=` ou `?pessoa=`.
 */
import { Suspense } from "react";

import { ListaDeVinculos } from "../../../../features/admin/ListaDeVinculos.tsx";
import { exigirAdministracaoDaPlataforma } from "../../../../server/acesso-da-administracao.ts";

export const metadata = {
  title: "Donos e equipes | Administração SimpleClick",
};

export default async function PaginaDeDonosEEquipes() {
  await exigirAdministracaoDaPlataforma("/admin/donos-e-equipes");
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 pb-12 sm:px-8 sm:pt-10 sm:pb-16">
      <header className="max-w-3xl">
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
          Donos e equipes
        </h1>
        <p className="mt-3 text-lg leading-8 text-[var(--cor-tinta-suave)]">
          Quem é dono e quem faz parte da equipe de cada loja. Atribua, troque
          ou remova aqui: cada ato pede um motivo e fica na auditoria.
        </p>
      </header>
      <Suspense fallback={null}>
        <ListaDeVinculos />
      </Suspense>
    </div>
  );
}
