import type { ReactNode } from "react";

import { RodapeLegal } from "../../../features/legal/RodapeLegal.tsx";
import {
  BarraInferiorDaSessao,
  NavegacaoDaSessao,
} from "../../_usuario/sessao.tsx";

/**
 * A moldura do feed dos clientes (card #37): o topo do cliente (card #105),
 * o rodapé e a barra inferior do celular. Segue o tema do aparelho (claro ou
 * escuro, Q-10304); o escuro é o desenho do Stitch (card #128).
 */
export default function LayoutDoExplorar({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="sc-feed-moldura">
      <NavegacaoDaSessao />
      {children}
      <RodapeLegal />
      <BarraInferiorDaSessao />
    </div>
  );
}
