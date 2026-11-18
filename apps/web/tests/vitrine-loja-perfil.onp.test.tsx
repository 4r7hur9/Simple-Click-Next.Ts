// @vitest-environment jsdom
/**
 * Card #107 · T-10701: o perfil da loja é uma composição síncrona, testável, e
 * a mesma tela serve a rota pública, o /sobre e a prévia da Aparência.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Vitrine } from "@simpleclick/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PerfilDaLoja } from "../src/features/loja/PerfilDaLoja.tsx";

const LOJA = {
  apelido: "sabor-e-cia",
  nome: "Sabor & Cia",
  ramo: "FOOD_SNACK",
  boasVindas: "Feito na hora.",
  sobre: null,
  logo: null,
  capa: null,
  formasDeEntrega: ["DELIVERY"],
  enderecoParaRetirada: null,
  whatsappPublico: null,
  rotulos: { catalogo: "Cardápio" },
  tema: {
    corDestaque: "#0f6e5c",
    fundoVitrine: null,
    topoCardapio: null,
  },
} as unknown as Vitrine["loja"];

const ABERTURA = {
  aberta: true,
  proximaAbertura: null,
  motivo: "HORARIO",
} as unknown as Vitrine["abertura"];

function desenhar(sobreAberto = false): string {
  return renderToStaticMarkup(
    <PerfilDaLoja
      loja={LOJA}
      abertura={ABERTURA}
      horario={null}
      recebimento={{ formasDePagamento: ["PIX"], entrega: {} as never }}
      posts={[]}
      logado={false}
      favorita={false}
      sobreAberto={sobreAberto}
    />,
  );
}

function fonte(caminho: string): string {
  return readFileSync(join(process.cwd(), caminho), "utf8");
}

describe("PerfilDaLoja", () => {
  it("[CA-7] @spec:AC-10718 o perfil desenha com dados prontos, sem busca nem script", () => {
    const html = desenhar();
    expect(html).toContain("Sabor &amp; Cia");
    expect(html).toContain('href="/loja/sabor-e-cia/cardapio"');
    expect(fonte("apps/web/src/features/loja/PerfilDaLoja.tsx")).not.toMatch(
      /^\s*["']use client["']/m,
    );
  });

  it("[CA-6] @spec:AC-10715 o Sobre só nasce aberto na rota /sobre", () => {
    expect(desenhar(false)).not.toMatch(/<dialog[^>]*\sopen/);
    expect(desenhar(true)).toMatch(/<dialog[^>]*\sopen/);
  });

  it("[CA-7] @spec:AC-10718 a rota pública, o /sobre e a prévia usam a mesma TelaDaLoja", () => {
    const tela = "apps/web/src/app/(loja)/loja/[slug]";
    expect(fonte(`${tela}/page.tsx`)).toContain("<TelaDaLoja");
    expect(fonte(`${tela}/sobre/page.tsx`)).toContain("<TelaDaLoja");
    expect(fonte(`${tela}/previa/[parte]/page.tsx`)).toContain("<TelaDaLoja");
    expect(fonte(`${tela}/TelaDaLoja.tsx`)).toContain("<PerfilDaLoja");
  });

  it("[CA-3] @spec:AC-10709 a tela repassa só o recebimento, nunca o fechamento inteiro", () => {
    const tela = fonte("apps/web/src/app/(loja)/loja/[slug]/TelaDaLoja.tsx");
    expect(tela).not.toMatch(/fechamento\.fechamento\.pix|\.\.\.fechamento/);
  });
});
