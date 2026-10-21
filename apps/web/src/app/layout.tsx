import { Inter, Space_Grotesk } from "next/font/google";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

import { BannerDeCookies } from "../features/legal/BannerDeCookies.tsx";
import { JanelaDeNovoAceite } from "../features/legal/JanelaDeNovoAceite.tsx";

/**
 * A TIPOGRAFIA É O QUE SEPARA "desenhado" de "modelo pronto".
 *
 * Fonte de sistema não é neutra: ela é a fonte de todo aplicativo do aparelho,
 * e uma página feita com ela parece qualquer página. Duas famílias resolvem
 * isso pelo menor código do projeto inteiro.
 *
 * `next/font` baixa NA CONSTRUÇÃO e serve do próprio domínio. Isso não é
 * detalhe: buscar fonte de outro domínio em execução deixa o texto invisível
 * até ela chegar, entrega o endereço de quem visita para um terceiro, e some em
 * silêncio quando aquele domínio cai — a página volta a parecer um modelo sem
 * ninguém notar.
 *
 * `display: "swap"` é o que garante que o texto apareça na hora, com a fonte de
 * reserva, e troque quando a definitiva chegar. Sem isso, quem está em rede ruim
 * fica olhando um retângulo em branco — que é exatamente o público desta página.
 *
 * As duas são VARIÁVEIS, e por isso nenhum peso é declarado: o guia desta versão
 * do Next pede peso só para quem não pode usar fonte variável. Listar pesos aqui
 * baixaria um arquivo por peso, em vez do único que cobre todos eles.
 */
const tituloDaMarca = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--fonte-titulo-da-marca",
});

const textoDaMarca = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--fonte-corpo",
});

export const metadata: Metadata = {
  title: "SimpleClick",
  description: "Vitrine, catálogo e pedidos para pequenos empreendedores",
};

// Interface é mobile-first (P-012): a escala parte da largura do aparelho.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * Casca de todas as telas. O idioma declarado é português do Brasil porque
 * leitor de tela usa esse atributo para escolher a pronúncia.
 */
export default function LayoutRaiz({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${tituloDaMarca.variable} ${textoDaMarca.variable}`}
    >
      {/* `sc-raiz` liga o corpo aos valores declarados do design system: fundo,
          tinta, fonte e o desenho único do anel de foco. */}
      <body className="sc-raiz min-h-dvh antialiased">{children}
        {/* Aviso de cookies (card #78): sem aceite, nada não essencial carrega. */}
        <BannerDeCookies />
        {/* Novo aceite dos termos (card #79): só aparece para quem está logado e tem versão pendente. */}
        <JanelaDeNovoAceite />
      </body>
    </html>
  );
}
