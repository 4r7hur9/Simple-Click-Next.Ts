/**
 * O cadastro da loja na administração (AC-207): dados, endereço na web, tipo
 * de negócio e exclusão. A ficha vem do provedor do layout.
 */
import { DadosDaLoja } from "../../../../../../features/admin/DadosDaLoja.tsx";
import { exigirAdministracaoDaPlataforma } from "../../../../../../server/acesso-da-administracao.ts";

export const metadata = {
  title: "Cadastro da loja | Administração SimpleClick",
};

interface ParametrosDaPagina {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function PaginaDoCadastro({ params }: ParametrosDaPagina) {
  const { id } = await params;
  await exigirAdministracaoDaPlataforma(
    `/admin/lojas/${encodeURIComponent(id)}/cadastro`,
  );
  return <DadosDaLoja />;
}
