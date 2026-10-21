import "@simpleclick/ui/styles/pedidos.css";

import { EstadoDoAgente } from "../../../../features/painel-pedidos/EstadoDoAgente.tsx";
import { QuadroKanban } from "../../../../features/painel-pedidos/QuadroKanban.tsx";
import { ehDiaValido } from "../../../../lib/quadro-de-pedidos.ts";

export const metadata = { title: "Pedidos | SimpleClick" };

export default async function PaginaDePedidos({
  searchParams,
}: {
  readonly searchParams: Promise<
    Readonly<Record<string, string | string[] | undefined>>
  >;
}) {
  const { dia } = await searchParams;
  const diaInicial =
    typeof dia === "string" && ehDiaValido(dia) ? dia : undefined;
  return (
    <>
      {/* A impressão automática fala acima do quadro, e só quando importa:
          agente fora do ar, ou cupom que não saiu (AC-624, AC-626). */}
      <div className="empty:hidden px-4 pt-6 sm:px-6 lg:px-8">
        <EstadoDoAgente />
      </div>
      <QuadroKanban diaInicial={diaInicial} />
    </>
  );
}
