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
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="mb-4 flex justify-end">
        <BotaoImprimirCupom pedidoId={id} />
      </div>
      <DetalheDoPedido pedidoId={id} />
    </main>
  );
}
