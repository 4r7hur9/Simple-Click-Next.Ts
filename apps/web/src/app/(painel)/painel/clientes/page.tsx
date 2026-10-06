import { ListaClientes } from "../../../../features/painel-clientes/ListaClientes.tsx";

export const metadata = { title: "Clientes | SimpleClick" };

export default function PaginaDeClientes() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
          Clientes da loja
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
          Quem compra com você
        </h1>
        <p className="mt-4 text-lg leading-8 text-[var(--cor-tinta-suave)]">
          Veja quem já comprou, quanto e quando foi a última vez — e cadastre
          quem pede pelo telefone ou no balcão.
        </p>
      </header>
      <div className="mt-10">
        <ListaClientes />
      </div>
    </main>
  );
}
