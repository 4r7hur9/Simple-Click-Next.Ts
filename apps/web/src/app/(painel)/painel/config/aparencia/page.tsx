import { FormularioAparencia } from "../../../../../features/config/FormularioAparencia.tsx";

export const metadata = { title: "Aparência da loja | SimpleClick" };

export default function PaginaDeAparencia() {
  return (
    <main className="pt-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
        Configuração da loja
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
        Aparência
      </h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--cor-tinta-suave)]">
        Atualize a mensagem, logo, capa e cor que aparecem na sua vitrine.
      </p>
      <FormularioAparencia />
    </main>
  );
}
