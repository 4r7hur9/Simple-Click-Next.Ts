import type { ReactNode } from "react";

/**
 * Casca sem dados da administração. As páginas abaixo dela só recebem dados
 * pelo caminho administrativo auditado da API; esta camada jamais interpreta
 * parâmetros de URL como autorização.
 */
export default function LayoutDaAdministracao({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <main aria-label="Administração da plataforma">{children}</main>;
}
