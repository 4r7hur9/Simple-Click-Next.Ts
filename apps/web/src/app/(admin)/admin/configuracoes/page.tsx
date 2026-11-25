/**
 * Configurações da plataforma (card #170, T-11): por ora, os limites padrão.
 * A API confere o acesso e grava LIMITES_PADRAO_ALTERADOS na auditoria.
 */
import { LimitesPadrao } from "../../../../features/admin/LimitesPadrao.tsx";
import { exigirAdministracaoDaPlataforma } from "../../../../server/acesso-da-administracao.ts";

export const metadata = {
  title: "Configurações | Administração SimpleClick",
};

export default async function PaginaDeConfiguracoes() {
  await exigirAdministracaoDaPlataforma("/admin/configuracoes");
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-12 sm:px-8 sm:pt-10 sm:pb-16">
      <header className="max-w-3xl">
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
          Configurações
        </h1>
        <p className="mt-3 text-lg leading-8 text-[var(--cor-tinta-suave)]">
          Os limites que valem para toda a plataforma. Cada mudança pede
          confirmação e aparece na auditoria, na aba Plataforma.
        </p>
      </header>
      <div className="mt-8">
        <LimitesPadrao />
      </div>
    </div>
  );
}
