/**
 * A landing da plataforma.
 *
 * Componente de SERVIDOR: a página chega pronta e legível sem script. O texto,
 * os dados de mercado (com fonte) e as telas do app moram em
 * `features/landing/`.
 */
import "@simpleclick/ui/styles/landing.css";
import "../features/landing/cenas/cenas.css";
import "../features/landing/cenas/tipografia.css";

import { PALETA_ESCURA } from "@simpleclick/ui";
import type { Metadata, Viewport } from "next";

import { RodapeDoSimpleClick } from "../features/legal/RodapeDoSimpleClick.tsx";
import { LandingDoSimpleClick } from "../features/landing/LandingDoSimpleClick.tsx";

export const metadata: Metadata = {
  title: "SimpleClick — sua loja online sem comissão e sem mensalidade",
  description:
    "Monte o cardápio ou o catálogo, mande o link no WhatsApp e acompanhe cada pedido num painel feito para o balcão. Grátis: sem comissão, sem mensalidade e sem limite de pedidos.",
};

/** A barra do navegador no celular acompanha o preto da landing. */
export const viewport: Viewport = {
  themeColor: PALETA_ESCURA.fundo,
  colorScheme: "dark",
};

export default function PaginaInicial() {
  return (
    <>
      <LandingDoSimpleClick />
      <RodapeDoSimpleClick />
    </>
  );
}
