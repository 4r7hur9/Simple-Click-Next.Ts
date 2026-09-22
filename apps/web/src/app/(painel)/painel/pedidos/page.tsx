import { QuadroDePedidos } from "../../../../features/painel-pedidos/QuadroDePedidos.tsx";

export const metadata = { title: "Pedidos | SimpleClick" };

export default function PaginaDePedidos() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
          Operação da loja
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
          Fila de pedidos
        </h1>
        <p className="mt-4 text-lg leading-8 text-[var(--cor-tinta-suave)]">
          Veja o que precisa de ação e acompanhe os pedidos em andamento sem
          recarregar a página.
        </p>
      </header>
      <div className="mt-10">
        <QuadroDePedidos />
      </div>
    </main>
  );
}
