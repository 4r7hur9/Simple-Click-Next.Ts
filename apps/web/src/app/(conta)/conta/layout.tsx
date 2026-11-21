import type { ReactNode } from "react";

import { RodapeLegal } from "../../../features/legal/RodapeLegal.tsx";
import {
  BarraInferiorDaSessao,
  NavegacaoDaSessao,
} from "../../_usuario/sessao.tsx";
import { lojaDeOrigemDoPedidoAtual } from "../../../server/loja-de-origem.ts";

/**
 * A conta do cliente com o topo e a barra inferior do cliente (cards #22 e
 * #105). Quem chegou saindo de uma loja ganha "Voltar à loja" no menu da
 * conta (card #135): o apelido vem da API, não do endereço.
 */
export default async function LayoutDaMinhaConta({
  children,
}: Readonly<{ children: ReactNode }>) {
  const lojaDeOrigem = await lojaDeOrigemDoPedidoAtual();
  // A moldura não desenha caixa (`display: contents`): só leva às telas da
  // conta o alvo de toque do cliente, de 48px (card #132).
  return (
    <div className="sc-moldura-cliente">
      <NavegacaoDaSessao lojaDeOrigem={lojaDeOrigem} />
      {children}
      <RodapeLegal />
      <BarraInferiorDaSessao />
    </div>
  );
}
