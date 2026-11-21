/**
 * Cadastro de loja pela administração (AC-200..AC-202).
 *
 * A página é a moldura; o formulário é quem busca os tipos de negócio, valida
 * pelo contrato e envia. Quem decide se a pessoa pode cadastrar é a API.
 */
import Link from "next/link";

import { FormularioNovaLoja } from "../../../../../features/admin/FormularioNovaLoja.tsx";
import { exigirAdministracaoDaPlataforma } from "../../../../../server/acesso-da-administracao.ts";

export const metadata = { title: "Nova loja | Administração SimpleClick" };

export default async function PaginaDeNovaLoja() {
  await exigirAdministracaoDaPlataforma("/admin/lojas/nova");
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-12 sm:px-8 sm:pt-10 sm:pb-16">
      <Link
        className="text-sm font-medium text-[var(--cor-primaria)]"
        href="/admin/lojas"
      >
        ← Voltar para as lojas
      </Link>
      <header className="mt-6 max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria-texto)]">
          Administração da plataforma
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
          Cadastrar loja
        </h1>
      </header>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--cor-tinta-suave)]">
        A loja nasce com um código de atendimento e o responsável recebe um
        convite por e-mail para definir a própria senha.
      </p>
      <FormularioNovaLoja />
    </div>
  );
}
