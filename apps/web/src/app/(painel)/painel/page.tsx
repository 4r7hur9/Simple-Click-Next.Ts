import { InicioDoPainel } from "../../../features/dashboard/InicioDoPainel.tsx";
import { periodoDoEndereco } from "../../../lib/metricas.ts";
import { exigirLojaDaPagina } from "../../../server/loja-da-pagina.ts";

export const metadata = {
  title: "Painel | SimpleClick",
  description:
    "O resumo da sua loja: vendas do dia contra o dia anterior, últimos 7 dias e o período que você escolher.",
};

interface PaginaInicialProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** O início do painel: as métricas da loja da sessão (dono e equipe). */
export default async function PaginaInicialDoPainel({
  searchParams,
}: PaginaInicialProps) {
  // Confere a sessão e a loja antes de mostrar qualquer coisa (T-115).
  await exigirLojaDaPagina();
  return (
    <InicioDoPainel
      consultaInicial={periodoDoEndereco(await searchParams)}
    />
  );
}
