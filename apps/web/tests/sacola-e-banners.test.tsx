// @vitest-environment jsdom
/**
 * Prova dos banners promocionais (0, 1 e vários; imagem por largura) — card #20.
 * A sacola flutuante arrastável foi aposentada no card #110 (Q-11003).
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { BannersPromocionais } from "../src/features/vitrine/BannersPromocionais";
import { BANNERS_DE_DEMONSTRACAO } from "../src/features/vitrine/banners-de-demonstracao";

describe("os banners promocionais", () => {
  it("sem banner, a seção não existe", () => {
    expect(renderToStaticMarkup(<BannersPromocionais banners={[]} />)).toBe("");
  });

  it("com um banner, aparece parado: sem pontos, sem setas, sem pausa", () => {
    const html = renderToStaticMarkup(
      <BannersPromocionais banners={BANNERS_DE_DEMONSTRACAO.slice(0, 1)} />,
    );
    expect(html).toContain("sc-banners__item");
    expect(html).not.toContain("sc-banners__ponto");
    expect(html).not.toContain("sc-banners__seta");
    expect(html).not.toContain("sc-banners__pausa");
  });

  it("cada banner tem imagem de computador e de celular, alt, link e texto opcionais", () => {
    const pagina = document.createElement("div");
    pagina.innerHTML = renderToStaticMarkup(
      <BannersPromocionais banners={BANNERS_DE_DEMONSTRACAO} />,
    );
    const itens = [...pagina.querySelectorAll(".sc-banners__item")];
    expect(itens).toHaveLength(3);
    const primeiro = itens[0];
    expect(primeiro?.querySelector("source")?.getAttribute("srcset")).toBe(
      "/banners-demo/combo-desktop.svg",
    );
    expect(primeiro?.querySelector("source")?.getAttribute("media")).toBe(
      "(min-width: 640px)",
    );
    expect(primeiro?.querySelector("img")?.getAttribute("src")).toBe(
      "/banners-demo/combo-mobile.svg",
    );
    expect(primeiro?.querySelector("img")?.getAttribute("alt")).toContain(
      "Combo da semana",
    );
    expect(primeiro?.querySelector("a")?.getAttribute("href")).toBe(
      "?categoria=combos",
    );
    // O segundo não tem link nem texto: só a imagem.
    expect(itens[1]?.querySelector("a")).toBeNull();
    expect(itens[1]?.querySelector(".sc-banners__texto")).toBeNull();
    // Pontos clicáveis, um por banner, e o botão de pausa (WCAG 2.2.2).
    expect(pagina.querySelectorAll(".sc-banners__ponto")).toHaveLength(3);
    expect(pagina.querySelector(".sc-banners__pausa")).not.toBeNull();
  });
});
