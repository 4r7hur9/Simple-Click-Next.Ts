/** A prévia das capas usa a mesma folha da apresentação da loja. */
import "@simpleclick/ui/styles/narrativa.css";

import type { ReactNode } from "react";

export default function MolduraDasCapas({
  children,
}: {
  readonly children: ReactNode;
}) {
  return children;
}
