/**
 * Resumo da loja na administração (AC-207, card #29): números, dono e equipe
 * e limites. A moldura (cabeçalho e abas) está no layout desta pasta.
 */
import { ResumoDaLoja } from "../../../../../features/admin/ResumoDaLoja.tsx";
import { exigirAdministracaoDaPlataforma } from "../../../../../server/acesso-da-administracao.ts";

export const metadata = { title: "Loja | Administração SimpleClick" };

interface ParametrosDaPagina {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function PaginaDoResumo({ params }: ParametrosDaPagina) {
  const { id } = await params;
  await exigirAdministracaoDaPlataforma(
    `/admin/lojas/${encodeURIComponent(id)}`,
  );
  return <ResumoDaLoja lojaId={id} />;
}
