import type { ReactNode } from "react";

import { MenuDaAdministracao } from "../../../features/painel/MenuDaAdministracao.tsx";
import { lojasPendentesDeAprovacao } from "../../../server/pendentes-da-administracao.ts";
import { UsuarioDoMenuDaSessao } from "../../_usuario/sessao.tsx";

/**
 * Casca sem dados da administração. As páginas abaixo dela só recebem dados
 * pelo caminho administrativo auditado da API; esta camada jamais interpreta
 * parâmetros de URL como autorização.
 */
export default async function LayoutDaAdministracao({
  children,
}: Readonly<{ children: ReactNode }>) {
  const pendentes = await lojasPendentesDeAprovacao();
  return (
    <div className="min-h-screen bg-[var(--cor-papel)] text-[var(--cor-tinta)] md:flex">
      <MenuDaAdministracao
        usuario={<UsuarioDoMenuDaSessao />}
        pendentes={pendentes}
      />
      <main
        aria-label="Administração da plataforma"
        className="min-w-0 flex-1 pb-24 md:pb-0"
      >
        {children}
      </main>
    </div>
  );
}
