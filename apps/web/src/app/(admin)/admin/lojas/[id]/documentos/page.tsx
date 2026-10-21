/**
 * O contrato e os documentos de uma loja na administração (AC-203 a AC-205).
 *
 * A página é a moldura; `DocumentosDaLoja` busca, mostra, envia e abre.
 * Quem decide se a pessoa alcança os documentos é a API, com a credencial
 * própria da administração — e o arquivo só sai por link temporário gerado
 * no clique, com cada abertura registrada na trilha.
 */
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
    <section aria-labelledby="titulo-dos-documentos">
      <h2
        id="titulo-dos-documentos"
        className="text-2xl font-semibold tracking-[-0.02em]"
      >
        Contrato e documentos
      </h2>
      <p className="mt-2 max-w-prose text-[var(--cor-tinta-suave)]">
        O contrato assinado e os documentos do responsável. Nenhum deles fica
        público: cada um abre por um link que vale cinco minutos, só com a sua
        sessão.
      </p>
      <DocumentosDaLoja lojaId={id} />
    </section>
  );
}
