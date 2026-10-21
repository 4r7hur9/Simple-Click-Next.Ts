/** MODELO PARA REVISÃO JURÍDICA ANTES DE PUBLICAR (ver features/legal/textos). */
import type { Metadata } from "next";

import { emailDoEncarregado } from "../../../features/legal/contato.ts";
import { PaginaLegal } from "../../../features/legal/PaginaLegal.tsx";
import { secoesDosCookies } from "../../../features/legal/textos/cookies.ts";

export const metadata: Metadata = {
  title: "Política de Cookies · SimpleClick",
  description: "Quais cookies usamos, para quê, e como você escolhe.",
};

export default function Pagina() {
  return (
    <PaginaLegal
      rotaAtual="/cookies"
      titulo="Política de Cookies"
      resumo="Quais cookies usamos, para quê, e como você escolhe."
      secoes={secoesDosCookies(emailDoEncarregado())}
    />
  );
}
