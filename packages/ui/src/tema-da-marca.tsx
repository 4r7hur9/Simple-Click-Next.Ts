import type { CSSProperties, ReactNode } from "react";

import { marcaDaLoja } from "./marca-da-loja";

export type TemaDaMarcaProps = {
  /** A cor de destaque escolhida pelo dono, em `#rrggbb`. */
  corDestaque: string;
  children: ReactNode;
  className?: string | undefined;
};

/**
 * Envelope da vitrine: pinta de uma vez, no servidor e sem piscar, a cor de
 * destaque do dono (`--cor-marca` e companhia) e o tema escuro dos
 * componentes comuns. O fundo continua sempre preto.
 *
 * Quem está fora do envelope — painel, administração — não recebe a cor.
 */
export function TemaDaMarca({
  corDestaque,
  children,
  className,
}: TemaDaMarcaProps) {
  const marca = marcaDaLoja(corDestaque);
  return (
    <div
      className={["sc-tema-loja", className].filter(Boolean).join(" ")}
      data-tema="escuro"
      data-contraste-ajustado={marca.avisos.length > 0 ? "sim" : undefined}
      style={marca.variaveis as CSSProperties}
    >
      {children}
    </div>
  );
}
