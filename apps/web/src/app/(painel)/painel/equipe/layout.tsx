import type { ReactNode } from "react";

import { GuardaDoPainel } from "../../../_painel/GuardaDoPainel.tsx";

/** Equipe e acessos: só o dono. A equipe vê a tela "Sem permissão". */
export default function LayoutDaEquipe({
  children,
}: {
  readonly children: ReactNode;
}) {
  return <GuardaDoPainel permissao="equipe">{children}</GuardaDoPainel>;
}
