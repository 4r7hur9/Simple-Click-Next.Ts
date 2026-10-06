/**
 * Histórico de auditoria da plataforma (AC-215, AC-118, AC-922).
 *
 * A página é a moldura; o histórico filtra, pagina e destaca o sensível.
 * Quem decide se a pessoa pode ler a trilha é a API, com a credencial própria
 * da administração — e a própria leitura fica registrada (AC-118).
 */
import Link from "next/link";

import { HistoricoDeAuditoria } from "../../../../features/admin/HistoricoDeAuditoria.tsx";

export const metadata = {
  title: "Histórico de auditoria | Administração SimpleClick",
};

interface ParametrosDaPagina {
  readonly searchParams: Promise<{ readonly loja?: string | string[] }>;
}

export default async function PaginaDaAuditoria({
  searchParams,
}: ParametrosDaPagina) {
  const { loja } = await searchParams;
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        className="text-sm font-medium text-[var(--cor-primaria)]"
        href="/admin/lojas"
      >
        ← Voltar para as lojas
      </Link>
      <header className="mt-6 max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
          Administração da plataforma
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
          Histórico de auditoria
        </h1>
        <p className="mt-3 text-lg leading-8 text-[var(--cor-tinta-suave)]">
          Quem fez o quê, quando e em qual loja. Nenhum registro pode ser
          alterado nem apagado, e as alterações sensíveis aparecem destacadas.
        </p>
      </header>
      <HistoricoDeAuditoria
        lojaInicial={typeof loja === "string" ? loja : ""}
      />
    </div>
  );
}
