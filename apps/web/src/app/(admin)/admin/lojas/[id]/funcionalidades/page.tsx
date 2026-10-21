/**
 * As funcionalidades liberadas de uma loja na administração (AC-212, AC-213).
 *
 * A página é a moldura; `FuncionalidadesDaLoja` busca, mostra e altera. Quem
 * decide se a pessoa alcança a loja é a API, com a credencial própria da
 * administração, e cada alteração vai para o histórico com o motivo.
 */
import { FuncionalidadesDaLoja } from "../../../../../../features/admin/FuncionalidadesDaLoja.tsx";

export const metadata = {
  title: "Funcionalidades liberadas | Administração SimpleClick",
};

interface ParametrosDaPagina {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function PaginaDasFuncionalidades({
  params,
}: ParametrosDaPagina) {
  const { id } = await params;
  return (
    <section aria-labelledby="titulo-das-funcionalidades">
      <h2
        id="titulo-das-funcionalidades"
        className="text-2xl font-semibold tracking-[-0.02em]"
      >
        Funcionalidades liberadas
      </h2>
      <p className="mt-2 max-w-prose text-[var(--cor-tinta-suave)]">
        O que esta loja usa da plataforma. Uma funcionalidade desligada some do
        painel do dono e deixa de responder, mesmo acessada pelo endereço.
      </p>
      <FuncionalidadesDaLoja lojaId={id} />
    </section>
  );
}
