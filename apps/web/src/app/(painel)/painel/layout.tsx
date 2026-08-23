import type { ReactNode } from "react";

/**
 * Casca sem dados do painel da loja.
 *
 * A decisão de papel e de loja é feita no servidor pela API, antes de qualquer
 * consulta. Esta casca não busca nem serializa dado de loja, para que abrir
 * uma URL não vire uma fonte de enumeração de recursos.
 */
export default function LayoutDoPainel({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <main aria-label="Painel da loja">{children}</main>;
}
