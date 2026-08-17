import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

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
    <html lang="pt-BR">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
