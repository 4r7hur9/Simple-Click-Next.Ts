import { PainelDeEstoque } from "../../../../features/painel-estoque/PainelDeEstoque.tsx";

export const metadata = { title: "Estoque | SimpleClick" };

export default function PaginaDoEstoque() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria-texto)]">
          Catálogo da loja
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Estoque
        </h1>
        <p className="mt-4 text-lg leading-8 text-[var(--cor-tinta-suave)]">
          Tudo o que você tem, produto por produto e variação por variação.
          Ajuste a contagem na própria linha; cada mudança fica no histórico do
          produto.
        </p>
      </header>
      <PainelDeEstoque />
    </div>
  );
}
