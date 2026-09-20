import { ListaCategorias } from "../../../../features/painel-catalogo/ListaCategorias.tsx";

export const metadata = { title: "Categorias | SimpleClick" };

export default function PaginaDeCategorias() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
          Catálogo da loja
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Organize o que você vende.
        </h1>
        <p className="mt-4 text-lg leading-8 text-[var(--cor-tinta-suave)]">
          Crie seções, escolha a ordem da vitrine e esconda uma categoria sem
          perder os produtos que já pertencem a ela.
        </p>
      </header>
      <ListaCategorias />
    </div>
  );
}
