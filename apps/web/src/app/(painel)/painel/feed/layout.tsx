import type { ReactNode } from "react";

import { GuardaDoPainel } from "../../../_painel/GuardaDoPainel.tsx";

/** Feed da loja: só o dono. A equipe vê a tela "Sem permissão". */
export default function LayoutDoFeed({
  children,
}: {
  readonly children: ReactNode;
}) {
  return <GuardaDoPainel permissao="feed">{children}</GuardaDoPainel>;
}
