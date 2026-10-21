/** MODELO PARA REVISÃO JURÍDICA ANTES DE PUBLICAR (ver features/legal/textos). */
import type { Metadata } from "next";

import { emailDoEncarregado } from "../../../features/legal/contato.ts";
import { PaginaLegal } from "../../../features/legal/PaginaLegal.tsx";
import { secoesDaLgpd } from "../../../features/legal/textos/lgpd.ts";

export const metadata: Metadata = {
  title: "Seus direitos (LGPD) · SimpleClick",
  description:
    "Como acessar, corrigir, excluir ou levar seus dados, e falar com o encarregado.",
};

export default function Pagina() {
  return (
    <PaginaLegal
      rotaAtual="/lgpd"
      titulo="Seus direitos (LGPD)"
      resumo="Como acessar, corrigir, excluir ou levar seus dados, e falar com o encarregado."
      secoes={secoesDaLgpd(emailDoEncarregado())}
    />
  );
}
