/**
 * O contrato e os documentos de uma loja na administração (AC-203 a AC-205).
 *
 * A página é a moldura; `DocumentosDaLoja` busca, mostra, envia e abre.
 * Quem decide se a pessoa alcança os documentos é a API, com a credencial
 * própria da administração — e o arquivo só sai por link temporário gerado
 * no clique, com cada abertura registrada na trilha.
 */
import Link from "next/link";

import { DocumentosDaLoja } from "../../../../../../features/admin/DocumentosDaLoja.tsx";

export const metadata = {
  title: "Contrato e documentos | Administração SimpleClick",
};

interface ParametrosDaPagina {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function PaginaDosDocumentos({
  params,
}: ParametrosDaPagina) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        className="text-sm font-medium text-[var(--cor-primaria)]"
        href={`/admin/lojas/${encodeURIComponent(id)}`}
      >
        ← Voltar para a ficha da loja
      </Link>
      <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em]">
        Contrato e documentos
      </h1>
      <p className="mt-2 max-w-prose text-lg">
        O contrato assinado e os documentos do responsável. Nenhum deles fica
        público: cada um abre por um link que vale cinco minutos, só com a sua
        sessão.
      </p>
      <DocumentosDaLoja lojaId={id} />
    </div>
  );
}
