import type { Metadata } from "next";
import type { ReactNode } from "react";

import "../../../../features/auth/entrada-da-administracao.css";

/**
 * A entrada da administração (card #11) mora FORA do grupo `(admin)`: o
 * layout de lá exige a sessão de administrador, e esta tela é justamente
 * onde ela começa. Nenhum layout acima desta pasta chama a guarda (a
 * varredura de `admin-entrar.test.tsx` trava isso).
 *
 * Não aparece em buscador (`robots` aqui e `X-Robots-Tag` em
 * `next.config.ts`) e não tem link no site público.
 */
export const metadata: Metadata = {
  title: "Entrar · Administração SimpleClick",
  robots: { index: false, follow: false },
};

export default function LayoutDaEntradaDaAdministracao({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
