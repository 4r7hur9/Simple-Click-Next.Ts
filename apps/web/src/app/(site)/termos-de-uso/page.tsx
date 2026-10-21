/** MODELO PARA REVISÃO JURÍDICA ANTES DE PUBLICAR (ver features/legal/textos). */
import type { Metadata } from "next";

import { emailDoEncarregado } from "../../../features/legal/contato.ts";
import { PaginaLegal } from "../../../features/legal/PaginaLegal.tsx";
import { secoesDosTermos } from "../../../features/legal/textos/termos-de-uso.ts";

export const metadata: Metadata = {
  title: "Termos de Uso · SimpleClick",
  description:
    "As regras para usar o SimpleClick como cliente ou como dono de loja.",
};

export default function Pagina() {
  return (
    <PaginaLegal
      rotaAtual="/termos-de-uso"
      titulo="Termos de Uso"
      resumo="As regras para usar o SimpleClick como cliente ou como dono de loja."
      secoes={secoesDosTermos(emailDoEncarregado())}
    />
  );
}
