/**
 * Pessoas da plataforma na administração (cards #29 e #170): clientes, donos e
 * equipe, com a situação de cada conta. A consulta mora no endereço
 * (`?tipo=donos&situacao=desativadas`), por isso a lista fica dentro de
 * `Suspense`. A rota segue `/admin/contas`; o rótulo é Pessoas.
 */
import type { Metadata } from "next";
import { Suspense } from "react";

import { ListaDeContas } from "../../../../features/admin/ListaDeContas.tsx";
import { exigirAdministracaoDaPlataforma } from "../../../../server/acesso-da-administracao.ts";

export const metadata: Metadata = {
  title: "Pessoas | Administração SimpleClick",
};

export default async function PaginaDasContas() {
  await exigirAdministracaoDaPlataforma("/admin/contas");
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 pb-12 sm:px-8 sm:pt-10 sm:pb-16">
      <header className="max-w-3xl">
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
          Pessoas
        </h1>
        <p className="mt-3 text-lg leading-8 text-[var(--cor-tinta-suave)]">
          Clientes, donos de loja e equipe. Abra a ficha para ver os vínculos
          com lojas, gerar um link de acesso ou desativar a conta.
        </p>
      </header>
      <Suspense fallback={null}>
        <ListaDeContas />
      </Suspense>
    </div>
  );
}
