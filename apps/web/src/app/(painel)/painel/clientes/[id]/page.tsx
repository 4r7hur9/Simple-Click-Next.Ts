import { FichaCliente } from "../../../../../features/painel-clientes/FichaCliente.tsx";

export const metadata = { title: "Ficha do cliente | SimpleClick" };

export default async function PaginaDaFichaDoCliente({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <FichaCliente clienteId={id} />
    </main>
  );
}
