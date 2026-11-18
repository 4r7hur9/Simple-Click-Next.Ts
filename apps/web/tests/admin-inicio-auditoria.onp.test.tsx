// @vitest-environment jsdom
/**
 * Início da administração (card #113, T-11309): os gráficos usam tokens e
 * mantêm o texto equivalente (`role="img"` com `aria-label`, ou lista com
 * rótulos e o valor por extenso), e os cartões não trazem cor literal.
 *
 * Só retoque visual: nenhum gráfico novo nem endpoint novo (ASM-11308).
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import {
  BarrasHorizontais,
  GraficoDeColunas,
  GraficoDeLinha,
  type PontoDeSerie,
} from "../src/features/admin-dashboard/graficos.tsx";
import { ler, RAIZ_WEB } from "./apoio-painel-lojista.ts";
import { join } from "node:path";

const PONTOS: PontoDeSerie[] = [
  { chave: "a", rotulo: "01/10", valor: 0, texto: "R$ 0,00" },
  { chave: "b", rotulo: "02/10", valor: 8000, texto: "R$ 80,00" },
  { chave: "c", rotulo: "03/10", valor: 3000, texto: "R$ 30,00" },
];

afterEach(() => {
  document.body.innerHTML = "";
});

describe("gráficos do início", () => {
  it("[CA-12] @spec:AC-11326 a linha é uma imagem com nome acessível que traz o pico por extenso", () => {
    document.body.innerHTML = renderToStaticMarkup(
      <GraficoDeLinha
        pontos={PONTOS}
        descricao="Faturamento por dia"
        marcas={[0, 2]}
        textoDoPico="Pico de R$ 80,00 em 02/10"
      />,
    );
    const imagem = document.querySelector('svg[role="img"]');
    expect(imagem?.getAttribute("aria-label")).toBe(
      "Faturamento por dia. Pico de R$ 80,00 em 02/10",
    );
    // Texto equivalente também fora do SVG.
    expect(document.querySelector("figcaption")?.textContent).toContain(
      "R$ 80,00",
    );
  });

  it("[CA-12] @spec:AC-11326 série zerada não some: vira legenda e o gráfico segue nomeado", () => {
    document.body.innerHTML = renderToStaticMarkup(
      <GraficoDeLinha
        pontos={PONTOS.map((p) => ({ ...p, valor: 0, texto: "R$ 0,00" }))}
        descricao="Faturamento por dia"
        marcas={[0]}
        textoDoPico="Sem movimento"
      />,
    );
    expect(document.querySelector('svg[role="img"]')).not.toBeNull();
    expect(document.querySelector("figcaption")?.textContent).toContain(
      "Sem movimento no período",
    );
  });

  it("[CA-12] @spec:AC-11326 colunas e barras são listas nomeadas com o valor por extenso de cada item", () => {
    document.body.innerHTML = renderToStaticMarkup(
      <>
        <GraficoDeColunas pontos={PONTOS} descricao="Pedidos por semana" />
        <BarrasHorizontais
          descricao="Lojas com mais pedidos"
          linhas={[
            {
              chave: "x",
              rotulo: "Pastel da Joi",
              valor: 10,
              texto: "10 pedidos",
            },
            {
              chave: "y",
              rotulo: "Doceria da Bia",
              valor: 4,
              texto: "4 pedidos",
            },
          ]}
        />
      </>,
    );
    const colunas = document.querySelector('[data-grafico="colunas"] ol');
    expect(colunas?.getAttribute("aria-label")).toBe("Pedidos por semana");
    expect(colunas?.textContent).toContain("R$ 80,00");
    const barras = document.querySelector('[data-grafico="barras"]');
    expect(barras?.getAttribute("aria-label")).toBe("Lojas com mais pedidos");
    expect(barras?.textContent).toContain("10 pedidos");
    expect(barras?.textContent).toContain("Doceria da Bia");
  });
});

describe("início: só tokens, sem cor nem verde novos", () => {
  const ARQUIVOS = [
    "DashboardDoAdmin.tsx",
    "CartaoDeNumero.tsx",
    "graficos.tsx",
  ];

  it("[CA-12] @spec:AC-11326 as cores inline e de classe do início vêm dos tokens --cor-*", () => {
    for (const nome of ARQUIVOS) {
      const codigo = ler(join(RAIZ_WEB, "src/features/admin-dashboard", nome));
      expect(codigo, nome).not.toMatch(
        /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/,
      );
      // Toda cor passada por style aponta para um token.
      for (const m of codigo.matchAll(
        /(?:background|color|fill|stroke|borderColor)\s*[:=]\s*["'`]([^"'`]+)["'`]/g,
      )) {
        const valor = m[1] ?? "";
        expect(
          /^(var\(--|currentColor|none|transparent)/.test(valor),
          `${nome}: ${valor}`,
        ).toBe(true);
      }
    }
  });
});
