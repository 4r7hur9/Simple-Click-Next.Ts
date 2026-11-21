/**
 * Home da administração: o painel de crescimento do SimpleClick. Quem pode
 * ver os números é decidido pela API (papel admin + tabela de administradores).
 */
import { DashboardDoAdmin } from "../../../features/admin-dashboard/DashboardDoAdmin.tsx";
import { exigirAdministracaoDaPlataforma } from "../../../server/acesso-da-administracao.ts";

export const metadata = { title: "Crescimento | Administração SimpleClick" };

export default async function PaginaInicialDaAdministracao() {
  await exigirAdministracaoDaPlataforma("/admin");
  return <DashboardDoAdmin />;
}
