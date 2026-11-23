import { SeloDaAdministracao } from "@simpleclick/ui";
import { Suspense, type ReactNode } from "react";

import { MenuDaAdministracao } from "../../../features/painel/MenuDaAdministracao.tsx";
import { exigirAdministracaoDaPlataforma } from "../../../server/acesso-da-administracao.ts";
import { lojasPendentesDeAprovacao } from "../../../server/pendentes-da-administracao.ts";
import {
  ModalDaContaDaSessao,
  UsuarioDoMenuDaSessao,
} from "../../_usuario/sessao.tsx";

/**
 * Casca sem dados da administração. Antes de desenhar menu ou conteúdo, a
 * guarda do servidor confirma na API, ao vivo, o grant de administração da
 * conta (card #163; revê a decisão "layout sem guarda" do #113): visitante vai
 * para `/entrar`, qualquer outra conta é redirecionada para a área do próprio
 * papel (card #177). As páginas abaixo também
 * chamam a guarda, porque a navegação parcial pode não reexecutar o layout.
 * Os dados seguem só pelo caminho administrativo auditado da API, e esta
 * camada jamais interpreta parâmetros de URL como autorização.
 */
export default async function LayoutDaAdministracao({
  children,
}: Readonly<{ children: ReactNode }>) {
  await exigirAdministracaoDaPlataforma("/admin");
  const pendentes = await lojasPendentesDeAprovacao();
  return (
    <div className="sc-moldura-admin min-h-screen bg-[var(--cor-papel)] text-[var(--cor-tinta)] md:flex">
      <MenuDaAdministracao
        usuario={<UsuarioDoMenuDaSessao />}
        pendentes={pendentes}
      />
      <main
        aria-label="Administração da plataforma"
        className="min-w-0 flex-1 pb-24 md:pb-0"
      >
        {/* O cabeçalho do modo administração (card #170, D-13). */}
        <div className="sc-cabecalho-admin px-4 sm:px-8">
          <SeloDaAdministracao />
          <span className="sc-cabecalho-admin__titulo">
            Administração da plataforma
          </span>
        </div>
        {children}
      </main>
      {/* "Minha conta" abre por cima da tela do admin (card #169). */}
      <Suspense fallback={null}>
        <ModalDaContaDaSessao />
      </Suspense>
    </div>
  );
}
