import type { ReactNode } from "react";
import { IconeSeta } from "./icones";

/**
 * Sanfona: um bloco que abre e fecha.
 *
 * É `details` com `summary`, e não um botão com estado: o navegador já entrega
 * teclado, anúncio de aberto e fechado, busca dentro do texto escondido
 * (Ctrl+F abre a sanfona certa) e funciona sem JavaScript. Para várias
 * sanfonas em que só uma fica aberta por vez, dê o mesmo `grupo` a todas — é o
 * atributo `name` nativo do `details`.
 */

export type SanfonaProps = {
  titulo: ReactNode;
  children: ReactNode;
  /** Nasce aberta. Depois disso quem manda é a pessoa. */
  abertaInicialmente?: boolean | undefined;
  /** Sanfonas do mesmo grupo abrem uma de cada vez. */
  grupo?: string | undefined;
  /** Ícone antes do título. */
  icone?: ReactNode | undefined;
  className?: string | undefined;
};

/** `details` nativo com o desenho do design system. */
export function Sanfona({
  titulo,
  children,
  abertaInicialmente = false,
  grupo,
  icone,
  className,
}: SanfonaProps) {
  return (
    <details
      className={["sc-sanfona", className].filter(Boolean).join(" ")}
      name={grupo}
      open={abertaInicialmente || undefined}
    >
      <summary className="sc-sanfona__titulo">
        {icone}
        <span className="sc-sanfona__texto">{titulo}</span>
        <IconeSeta className="sc-sanfona__seta" />
      </summary>
      <div className="sc-sanfona__corpo">{children}</div>
    </details>
  );
}
