/** MODELO PARA REVISÃO JURÍDICA ANTES DE PUBLICAR (ver features/legal/textos). */
import type { Metadata } from "next";

import { emailDoEncarregado } from "../../../features/legal/contato.ts";
import { PaginaLegal } from "../../../features/legal/PaginaLegal.tsx";
import { secoesDaPrivacidade } from "../../../features/legal/textos/politica-de-privacidade.ts";

export const metadata: Metadata = {
  title: "Política de Privacidade · SimpleClick",
  description: "Como cuidamos dos seus dados pessoais, conforme a LGPD.",
};

export default function Pagina() {
  return (
    <PaginaLegal
      rotaAtual="/politica-de-privacidade"
      titulo="Política de Privacidade"
      resumo="Como cuidamos dos seus dados pessoais, conforme a LGPD."
      secoes={secoesDaPrivacidade(emailDoEncarregado())}
    />
  );
}
