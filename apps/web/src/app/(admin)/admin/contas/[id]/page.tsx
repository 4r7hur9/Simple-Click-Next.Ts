/**
 * A ficha de uma conta na administração (card #29): dados, lojas e o limite
 * de lojas do dono. Quem decide se a pessoa pode ver é a API.
 */
import type { Metadata } from "next";

import { FichaDaConta } from "../../../../../features/admin/FichaDaConta.tsx";
import { exigirAdministracaoDaPlataforma } from "../../../../../server/acesso-da-administracao.ts";

export const metadata: Metadata = {
  title: "Conta | Administração SimpleClick",
};

interface ParametrosDaPagina {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function PaginaDaConta({ params }: ParametrosDaPagina) {
  const { id } = await params;
  await exigirAdministracaoDaPlataforma(
    `/admin/contas/${encodeURIComponent(id)}`,
  );
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-12 sm:px-8 sm:pt-10 sm:pb-16">
      <FichaDaConta identidadeId={id} />
    </div>
  );
}
