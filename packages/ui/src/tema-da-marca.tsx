import type { ReactNode } from "react";

export type TemaDaMarcaProps = {
  children: ReactNode;
  className?: string | undefined;
};

/**
 * Envelope da vitrine. NÃO fixa tema: a loja segue o tema do aparelho
 * (`prefers-color-scheme`) e o `data-tema` da raiz, como o resto do site
 * (card #131). NÃO há cor por loja: tudo pinta com o verde oficial
 * SimpleClick (`--cor-primaria`, `--marca-verde-click` em theme.css), com
 * texto escuro sobre ele.
 */
export function TemaDaMarca({ children, className }: TemaDaMarcaProps) {
  return (
    <div className={["sc-tema-loja", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
