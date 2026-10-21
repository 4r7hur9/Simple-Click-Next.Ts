import "@simpleclick/ui/styles/pedidos.css";

import { FichaCliente } from "../../../../../features/painel-clientes/FichaCliente.tsx";

export const metadata = { title: "Ficha do cliente | SimpleClick" };

export default async function PaginaDaFichaDoCliente({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  return <FichaCliente clienteId={id} />;
}
