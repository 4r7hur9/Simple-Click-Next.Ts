import "@simpleclick/ui/styles/pedidos.css";

import { DetalheDoPedido } from "../../../../../features/painel-pedidos/DetalheDoPedido.tsx";
import { BotaoImprimirCupom } from "../../../../../features/impressao/BotaoImprimirCupom.tsx";

export const metadata = { title: "Detalhe do pedido | SimpleClick" };

export default async function PaginaDetalheDoPedido({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="sc-pedidos">
      <div className="flex justify-end">
        <BotaoImprimirCupom pedidoId={id} />
      </div>
      <DetalheDoPedido pedidoId={id} />
    </div>
  );
}
