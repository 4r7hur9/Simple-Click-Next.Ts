/**
 * Histórico de auditoria da plataforma (AC-215, AC-118, AC-922).
 *
 * A página é a moldura; o histórico filtra, pagina e destaca o sensível.
 * Quem decide se a pessoa pode ler a trilha é a API, com a credencial própria
 * da administração — e a própria leitura fica registrada (AC-118).
 */
import Link from "next/link";

import { HistoricoDeAuditoria } from "../../../../features/admin/HistoricoDeAuditoria.tsx";
import { exigirAdministracaoDaPlataforma } from "../../../../server/acesso-da-administracao.ts";

export const metadata = {
  title: "Histórico de auditoria | Administração SimpleClick",
};

interface ParametrosDaPagina {
  readonly searchParams: Promise<{
    readonly loja?: string | string[];
    readonly aba?: string | string[];
  }>;
}

export default async function PaginaDaAuditoria({
  searchParams,
}: ParametrosDaPagina) {
  await exigirAdministracaoDaPlataforma("/admin/auditoria");
  const { loja, aba } = await searchParams;
  const plataforma = aba === "plataforma";
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-12 sm:px-8 sm:pt-10 sm:pb-16">
      <Link
        className="text-sm font-medium text-[var(--cor-primaria-texto)]"
        href="/admin/lojas"
      >
        ← Voltar para as lojas
      </Link>
      <header className="mt-6 max-w-3xl">
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
          Histórico de auditoria
        </h1>
        <p className="mt-3 text-lg leading-8 text-[var(--cor-tinta-suave)]">
          Quem fez o quê, quando e em qual loja. Nenhum registro pode ser
          alterado nem apagado, e as alterações sensíveis aparecem destacadas.
        </p>
      </header>
      <HistoricoDeAuditoria
        key={plataforma ? "plataforma" : "lojas"}
        aba={plataforma ? "plataforma" : "lojas"}
        lojaInicial={typeof loja === "string" ? loja : ""}
      />
    </div>
  );
}
