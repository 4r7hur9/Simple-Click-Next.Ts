import type { ReactNode } from "react";

import { MolduraDaConfiguracao } from "../../../../features/painel/MolduraDaConfiguracao.tsx";
import { GuardaDoPainel } from "../../../_painel/GuardaDoPainel.tsx";

/** A aparência tem rota própria (`/painel/aparencia`), a moldura das configurações e a guarda da personalização. */
export default function LayoutDaAparencia({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <GuardaDoPainel permissao="personalizacao">
      <MolduraDaConfiguracao>{children}</MolduraDaConfiguracao>
    </GuardaDoPainel>
  );
}
