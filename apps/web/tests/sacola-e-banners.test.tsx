// @vitest-environment jsdom
/**
 * Prova da sacola flutuante (posição presa à tela e lembrada) e dos banners
 * promocionais (0, 1 e vários; imagem por largura) — card #20.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  deFracao,
  encostarNaBorda,
  lerPosicaoGuardada,
  limitar,
  paraFracao,
  passoDaTecla,
  POSICAO_INICIAL,
} from "../src/features/carrinho/posicao-da-sacola";
import { BannersPromocionais } from "../src/features/vitrine/BannersPromocionais";
import { BANNERS_DE_DEMONSTRACAO } from "../src/features/vitrine/banners-de-demonstracao";

const AREA = { esquerda: 12, topo: 12, largura: 366, altura: 776 };
const SACOLA = { largura: 140, altura: 56 };

describe("a posição da sacola", () => {
  it("nunca sai da área livre, nem arrastada para longe", () => {
    expect(limitar({ x: -500, y: 9999 }, SACOLA, AREA)).toEqual({
      x: 12,
      y: 732,
    });
    expect(limitar({ x: 9999, y: -10 }, SACOLA, AREA)).toEqual({
      x: 238,
      y: 12,
    });
  });

  it("arrastada livre, ao soltar encosta na borda lateral mais próxima e mantém a altura", () => {
    expect(encostarNaBorda({ x: 60, y: 300 }, SACOLA, AREA)).toEqual({
      x: 12,
      y: 300,
    });
    expect(encostarNaBorda({ x: 200, y: 300 }, SACOLA, AREA)).toEqual({
      x: 238,
      y: 300,
    });
    // Fora da tela, volta para dentro e para a borda.
    expect(encostarNaBorda({ x: -900, y: 5000 }, SACOLA, AREA)).toEqual({
      x: 12,
      y: 732,
    });
  });

  it("é guardada em fração e volta para dentro da tela mesmo se a tela mudar", () => {
    const fracao = paraFracao({ x: 238, y: 732 }, SACOLA, AREA);
    expect(fracao).toEqual({ fx: 1, fy: 1 });
    // O celular girou: a mesma fração cai no canto da tela nova.
    const deitada = { esquerda: 12, topo: 12, largura: 820, altura: 366 };
    expect(deFracao(fracao, SACOLA, deitada)).toEqual({ x: 692, y: 322 });
  });

  it("sem nada guardado, ou com lixo, nasce no canto de baixo à direita", () => {
    expect(lerPosicaoGuardada(null)).toEqual(POSICAO_INICIAL);
    expect(lerPosicaoGuardada("{quebrado")).toEqual(POSICAO_INICIAL);
    expect(lerPosicaoGuardada('{"fx":"a","fy":1}')).toEqual(POSICAO_INICIAL);
    expect(lerPosicaoGuardada('{"fx":4,"fy":-1}')).toEqual({ fx: 1, fy: 0 });
  });

  it("as setas movem; Shift move mais; outras teclas não movem", () => {
    expect(passoDaTecla("ArrowLeft", false)).toEqual({ x: -16, y: 0 });
    expect(passoDaTecla("ArrowDown", true)).toEqual({ x: 0, y: 64 });
    expect(passoDaTecla("Enter", false)).toBeNull();
  });
});

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
