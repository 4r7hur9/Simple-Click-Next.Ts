import { FormularioEntrega } from "../../../../../features/config/FormularioEntrega.tsx";

export const metadata = { title: "Entrega da loja | SimpleClick" };

export default function PaginaDeEntrega() {
  return (
    <main className="pt-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
        Configuração da loja
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
        Entrega e retirada
      </h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--cor-tinta-suave)]">
        Defina como o pedido chega ao cliente, a taxa e os valores mínimos.
      </p>
      <FormularioEntrega />
    </main>
  );
}
