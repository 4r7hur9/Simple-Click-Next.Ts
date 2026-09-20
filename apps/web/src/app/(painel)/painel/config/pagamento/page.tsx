import { FormularioPagamento } from "../../../../../features/config/FormularioPagamento.tsx";

export const metadata = { title: "Pagamento da loja | SimpleClick" };

export default function PaginaDePagamento() {
  return (
    <main className="pt-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
        Configuração da loja
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
        Pagamento
      </h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--cor-tinta-suave)]">
        Escolha como seus clientes pagam e informe a chave PIX usada no pedido.
      </p>
      <FormularioPagamento />
    </main>
  );
}
