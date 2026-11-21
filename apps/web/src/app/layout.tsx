import { Inter, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

import { BannerDeCookies } from "../features/legal/BannerDeCookies.tsx";
import { ForaDaTv } from "../features/tv/ForaDaTv.tsx";
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
 * A família do redesign Stitch é a Plus Jakarta Sans, em títulos e texto (card
 * #104). Ela é VARIÁVEL, e por isso nenhum peso é declarado: o guia desta versão
 * do Next pede peso só para quem não pode usar fonte variável. Listar pesos aqui
 * baixaria um arquivo por peso, em vez do único que cobre todos eles.
 *
 * Os nomes `--fonte-titulo-da-marca` e `--fonte-corpo` continuam sendo o ponto
 * de troca: o tema e as folhas de estilo já os leem. Como o `next/font` declara
 * uma variável por chamada, `--fonte-corpo` aponta para a mesma família em
 * `globals.css` (Jakarta em tudo, sem baixar o arquivo duas vezes).
 */
const tituloDaMarca = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--fonte-titulo-da-marca",
});

/**
 * A landing "/" ficou de fora do redesign (decisão do dono do produto): ela
 * continua em Space Grotesk e Inter. Só a landing as usa (regra em
 * `globals.css`), então `preload: false` evita pagar o download nas demais
 * páginas. O navegador só baixa o arquivo quando a landing o pede.
 */
const tituloLegado = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--fonte-legada-titulo",
});

const textoLegado = Inter({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--fonte-legada-corpo",
});

export const metadata: Metadata = {
  title: "SimpleClick",
  description: "Vitrine, catálogo e pedidos para pequenos empreendedores",
};

// Interface é mobile-first (P-012): a escala parte da largura do aparelho.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Sem `cover`, `env(safe-area-inset-*)` vale 0 no iPhone e a barra inferior
  // fixa ficaria sob o indicador de início (card #104).
  viewportFit: "cover",
};

/**
 * Casca de todas as telas. O idioma declarado é português do Brasil porque
 * leitor de tela usa esse atributo para escolher a pronúncia.
 */
export default function LayoutRaiz({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${tituloDaMarca.variable} ${tituloLegado.variable} ${textoLegado.variable}`}
    >
      {/* `sc-raiz` liga o corpo aos valores declarados do design system: fundo,
          tinta, fonte e o desenho único do anel de foco. */}
      <body className="sc-raiz min-h-dvh antialiased">
        {children}
        {/* Aviso de cookies (card #78): sem aceite, nada não essencial carrega. */}
        {/* Na TV (quiosque sem teclado) o aviso não monta: ver features/tv/rota-da-tv.ts. */}
        <ForaDaTv>
          <BannerDeCookies />
        </ForaDaTv>
        {/* Novo aceite dos termos (card #79): só aparece para quem está logado e tem versão pendente. */}
        <JanelaDeNovoAceite />
      </body>
    </html>
  );
}
