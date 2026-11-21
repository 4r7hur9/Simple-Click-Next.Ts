import { Aviso } from "@simpleclick/ui";

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

/**
 * O início do painel: as métricas da loja da sessão (dono e equipe).
 *
 * Quem chegou por `/escolher-loja/propria` (a escolha guardada neste navegador
 * não valia mais e a conta tem uma só loja) vê o aviso de que a loja foi
 * trocada. Só o valor exato `?loja=trocada` mostra o aviso, e o texto é o
 * mesmo para loja que saiu da conta e para loja de outra pessoa (card #170).
 */
export default async function PaginaInicialDoPainel({
  searchParams,
}: PaginaInicialProps) {
  // Confere a sessão e a loja antes de mostrar qualquer coisa (T-115).
  const { loja } = await exigirLojaDaPagina();
  const consulta = await searchParams;
  return (
    <>
      {consulta["loja"] === "trocada" ? (
        <div className="mx-auto max-w-7xl px-4 pt-6 min-[540px]:px-6 lg:px-8">
          <Aviso tom="atencao" titulo="Abrimos a sua loja">
            A loja escolhida antes neste navegador não está mais entre as
            suas. Você está em {loja.nome}.
          </Aviso>
        </div>
      ) : null}
      <InicioDoPainel consultaInicial={periodoDoEndereco(consulta)} />
    </>
  );
}
