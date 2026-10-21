import type { ReactNode } from "react";

import { RodapeLegal } from "../../../features/legal/RodapeLegal.tsx";
import { LateralDaSessao } from "../../_usuario/sessao.tsx";

/** A conta do cliente com a lateral do usuário (card #22). */
export default function LayoutDaMinhaConta({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <LateralDaSessao />
      {children}
      <RodapeLegal />
    </>
  );
}
