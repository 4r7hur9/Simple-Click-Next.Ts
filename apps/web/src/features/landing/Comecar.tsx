import { ArrowRight } from "lucide-react";

import { LINK_PARA_COMECAR } from "./conteudo.ts";

/** O caminho para começar. O rótulo muda com a seção que a pessoa acabou de ler. */
export function Comecar({
  rotulo = "Criar minha loja grátis",
  variante = "cheio",
  alvoDaCena = false,
}: {
  readonly rotulo?: string;
  readonly variante?: "cheio" | "contorno";
  /** O botão para onde a cena 3D converge no convite (só um na página). */
  readonly alvoDaCena?: boolean;
}) {
  return (
    <a
      className={`sc-lp-botao sc-lp-botao--${variante}`}
      href={LINK_PARA_COMECAR}
      {...(alvoDaCena ? { "data-botao-da-cena": "" } : {})}
    >
      <span>{rotulo}</span>
      <ArrowRight aria-hidden="true" size={18} strokeWidth={2} />
    </a>
  );
}
