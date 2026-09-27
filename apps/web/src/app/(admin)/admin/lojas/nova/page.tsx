/**
 * Cadastro de loja pela administração (AC-200..AC-202).
 *
 * A página é a moldura; o formulário é quem busca os tipos de negócio, valida
 * pelo contrato e envia. Quem decide se a pessoa pode cadastrar é a API.
 */
import Link from "next/link";

import { FormularioNovaLoja } from "../../../../../features/admin/FormularioNovaLoja.tsx";

export const metadata = { title: "Nova loja | Administração SimpleClick" };

export default function PaginaDeNovaLoja() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        className="text-sm font-medium text-[var(--cor-primaria)]"
        href="/admin/lojas"
      >
        ← Voltar para as lojas
      </Link>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">
        Cadastrar loja
      </h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--cor-tinta-suave)]">
        A loja nasce com um código de atendimento e o responsável recebe um
        convite por e-mail para definir a própria senha.
      </p>
      <FormularioNovaLoja />
    </div>
  );
}
