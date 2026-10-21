import type { ReactNode } from "react";

import { MolduraDaConfiguracao } from "../../../../features/painel/MolduraDaConfiguracao.tsx";
import { GuardaDoPainel } from "../../../_painel/GuardaDoPainel.tsx";

/**
 * As configurações da loja são só do dono: a equipe que abrir o endereço vê
 * a tela "Sem permissão". A moldura (voltar + navegação) é a de
 * `MolduraDaConfiguracao`, a mesma da Aparência.
 */
export default function LayoutDaConfiguracao({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <GuardaDoPainel permissao="configuracoes">
      <MolduraDaConfiguracao>{children}</MolduraDaConfiguracao>
    </GuardaDoPainel>
  );
}
