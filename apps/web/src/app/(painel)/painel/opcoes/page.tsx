import { PainelDeOpcoes } from "../../../../features/painel-opcoes/PainelDeOpcoes.tsx";

export const metadata = { title: "Opções e adicionais | SimpleClick" };

export default function PaginaDasOpcoes() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria-texto)]">
          Catálogo da loja
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Opções e adicionais
        </h1>
        <p className="mt-4 text-lg leading-8 text-[var(--cor-tinta-suave)]">
          As escolhas que o cliente faz no item, como borda recheada, ponto da
          carne ou adicionais. O carrinho soma os acréscimos no servidor.
        </p>
      </header>
      <PainelDeOpcoes />
    </div>
  );
}
