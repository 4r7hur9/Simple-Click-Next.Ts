/** A prévia do catálogo usa as folhas da vitrine e do marcador. */
import "@simpleclick/ui/styles/narrativa.css";
import "@simpleclick/ui/styles/vitrine.css";

import type { ReactNode } from "react";

export default function MolduraDaPreviaDoCatalogo({
  children,
}: {
  readonly children: ReactNode;
}) {
  return children;
}
