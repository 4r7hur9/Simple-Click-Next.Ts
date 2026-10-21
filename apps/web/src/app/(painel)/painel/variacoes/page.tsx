import { PainelDeVariacoes } from "../../../../features/painel-variacoes/PainelDeVariacoes.tsx";

export const metadata = { title: "Variações | SimpleClick" };

export default function PaginaDasVariacoes() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria-texto)]">
          Catálogo da loja
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Variações
        </h1>
        <p className="mt-4 text-lg leading-8 text-[var(--cor-tinta-suave)]">
          Tamanho, cor, sabor ou número: cada variação tem preço, SKU e estoque
          próprios. Veja todas aqui e edite sem abrir produto por produto.
        </p>
      </header>
      <PainelDeVariacoes />
    </div>
  );
}
