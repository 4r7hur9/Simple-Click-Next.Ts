/**
 * Moldura das páginas de uma loja.
 *
 * A folha da narrativa entra AQUI, e não no layout raiz: ela vale para as
 * páginas de apresentação, e carregá-la em todo o site faria o painel do dono
 * pagar por estilo que ele não usa.
 */
import "@simpleclick/ui/styles/narrativa.css";

import type { ReactNode } from "react";

export default function MolduraDaLoja({
  children,
}: {
  readonly children: ReactNode;
}) {
  return children;
}
