import type { ReactNode } from "react";

import { RodapeLegal } from "../../../features/legal/RodapeLegal.tsx";
import { LateralDaSessao } from "../../_usuario/sessao.tsx";

/**
 * A moldura do feed dos clientes (card #37): tema escuro do SimpleClick e a
 * lateral do usuário. As abas moram na própria tela, para levar os filtros
 * junto ao trocar entre Produtos e Lojas.
 */
export default function LayoutDoExplorar({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="sc-feed-moldura" data-tema="escuro">
      <LateralDaSessao />
      {children}
      <RodapeLegal />
    </div>
  );
}
