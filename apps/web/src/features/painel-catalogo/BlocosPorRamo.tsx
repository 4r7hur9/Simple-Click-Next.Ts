import type { ReactNode } from "react";

import {
  temBloco,
  type ComposicaoDoRamo,
  type TelaDoRamo,
} from "../../lib/vertical.ts";

interface Props {
  readonly blocos: ComposicaoDoRamo;
  readonly tela: TelaDoRamo;
  readonly bloco: string;
  readonly children: ReactNode;
}

/** Renderiza um bloco somente quando o preset do ramo o prevê. */
export function BlocosPorRamo({ blocos, tela, bloco, children }: Props) {
  return temBloco(blocos, tela, bloco) ? <>{children}</> : null;
}
