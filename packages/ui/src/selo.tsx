import type { ReactNode } from "react";

/**
 * Selo: o status curto de uma coisa — "Pago", "Em preparo", "Esgotado".
 *
 * A bolinha colorida é enfeite para quem bate o olho; o sentido está no texto,
 * e por isso a bolinha sai da árvore de acessibilidade. Selo com só a cor diria
 * "verde" a quem não distingue verde de vermelho.
 *
 * O selo não anuncia nada sozinho: ele é parte do conteúdo, como o texto ao
 * lado. Mudança que precisa ser avisada na hora é trabalho do `Aviso`.
 */

export type TomDeSelo = "neutro" | "sucesso" | "atencao" | "erro" | "info";

export type SeloProps = {
  tom?: TomDeSelo | undefined;
  children: ReactNode;
  /** Tira a bolinha, para selo de contagem ou de categoria. */
  semBolinha?: boolean | undefined;
  className?: string | undefined;
};

/** Pílula com bolinha e texto de status, nos pares de cor do tema. */
export function Selo({
  tom = "neutro",
  children,
  semBolinha = false,
  className,
}: SeloProps) {
  return (
    <span
      className={["sc-selo", `sc-selo--${tom}`, className]
        .filter(Boolean)
        .join(" ")}
    >
      {!semBolinha && <span aria-hidden="true" className="sc-selo__bolinha" />}
      {children}
    </span>
  );
}
