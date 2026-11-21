/** O histórico de alterações da loja (AC-207, AC-118). */
import { HistoricoDaLoja } from "../../../../../../features/admin/HistoricoDaLoja.tsx";
import { exigirAdministracaoDaPlataforma } from "../../../../../../server/acesso-da-administracao.ts";

export const metadata = {
  title: "Histórico da loja | Administração SimpleClick",
};

interface ParametrosDaPagina {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function PaginaDoHistorico({
  params,
}: ParametrosDaPagina) {
  const { id } = await params;
  await exigirAdministracaoDaPlataforma(
    `/admin/lojas/${encodeURIComponent(id)}/historico`,
  );
  return <HistoricoDaLoja />;
}
