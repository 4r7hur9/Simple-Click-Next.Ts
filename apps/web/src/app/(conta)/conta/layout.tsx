import type { ReactNode } from "react";

import { RodapeLegal } from "../../../features/legal/RodapeLegal.tsx";
import {
  BarraInferiorDaSessao,
  NavegacaoDaSessao,
} from "../../_usuario/sessao.tsx";

/** A conta do cliente com o topo e a barra inferior do cliente (cards #22 e #105). */
export default function LayoutDaMinhaConta({
  children,
}: Readonly<{ children: ReactNode }>) {
  // A moldura não desenha caixa (`display: contents`): só leva às telas da
  // conta o alvo de toque do cliente, de 48px (card #132).
  return (
    <div className="sc-moldura-cliente">
      <NavegacaoDaSessao />
      {children}
      <RodapeLegal />
      <BarraInferiorDaSessao />
    </div>
  );
}
