import type { ReactNode } from "react";

import { RodapeLegal } from "../../../features/legal/RodapeLegal.tsx";
import { desviarAdministradorDasAreasDeCliente } from "../../../server/area-do-papel.ts";
import {
  BarraInferiorDaSessao,
  NavegacaoDaSessao,
} from "../../_usuario/sessao.tsx";

/**
 * A moldura do feed dos clientes (card #37): o topo do cliente (card #105),
 * o rodapé e a barra inferior do celular. Segue o tema do aparelho (claro ou
 * escuro, Q-10304); o escuro é o desenho do Stitch (card #128).
 *
 * É área de clientes: o administrador confirmado é levado para `/admin` pelo
 * servidor, antes de qualquer HTML (card #170). Visitante e API fora do ar
 * abrem normalmente. Cada página repete a guarda, porque a navegação parcial
 * do App Router pode não reexecutar o layout; a pergunta à API é uma só.
 */
export default async function LayoutDoExplorar({
  children,
}: Readonly<{ children: ReactNode }>) {
  await desviarAdministradorDasAreasDeCliente();
  return (
    <div className="sc-feed-moldura">
      <NavegacaoDaSessao />
      {children}
      <RodapeLegal />
      <BarraInferiorDaSessao />
    </div>
  );
}
