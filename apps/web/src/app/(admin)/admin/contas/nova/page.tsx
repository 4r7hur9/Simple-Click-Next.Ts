/**
 * Cadastro de pessoa pela administração (card #170, T-9): cria a conta sem
 * senha e devolve o link único de acesso. Quem decide se a pessoa pode
 * cadastrar é a API; a página só exige a administração e monta o formulário.
 */
import Link from "next/link";

import { FormularioDePessoa } from "../../../../../features/admin/FormularioDePessoa.tsx";
import { exigirAdministracaoDaPlataforma } from "../../../../../server/acesso-da-administracao.ts";

export const metadata = {
  title: "Cadastrar pessoa | Administração SimpleClick",
};

export default async function PaginaDeNovaPessoa() {
  await exigirAdministracaoDaPlataforma("/admin/contas/nova");
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-12 sm:px-8 sm:pt-10 sm:pb-16">
      <Link
        className="text-sm font-medium text-[var(--cor-primaria)]"
        href="/admin/contas"
        prefetch={false}
      >
        ← Voltar para as pessoas
      </Link>
      <header className="mt-6 max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria-texto)]">
          Administração da plataforma
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
          Cadastrar pessoa
        </h1>
      </header>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--cor-tinta-suave)]">
        A conta nasce sem senha e sem papel. Você recebe um link de uso único
        para entregar à pessoa, que define a própria senha.
      </p>
      <FormularioDePessoa />
    </div>
  );
}
