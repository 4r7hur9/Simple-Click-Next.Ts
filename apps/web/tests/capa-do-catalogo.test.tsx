// @vitest-environment jsdom
/**
 * Prova da capa do cardápio: a marca da loja em destaque (card #20).
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CapaDaVitrine } from "../src/features/vitrine/CapaDaVitrine";

const ABERTA = {
  aberta: true,
  proximaAbertura: null,
  motivo: "ABERTA" as const,
};

function desenhar(
  sobrescrita: Partial<Parameters<typeof CapaDaVitrine>[0]> = {},
) {
  const pagina = document.createElement("div");
  pagina.innerHTML = renderToStaticMarkup(
    <CapaDaVitrine
      apelidoDaLoja="pastelaria-da-vila"
      nomeDaLoja="Pastelaria da Vila"
      capa="/demo/capa.webp"
      ramo="FOOD_SNACK"
      rotuloDoCatalogo="Cardápio"
      abertura={ABERTA}
      {...sobrescrita}
    />,
  );
  return pagina;
}

describe("a capa do cardápio", () => {
  it("o nome da loja, no bloco verde, é o link para a loja — sem foto quadrada", () => {
    const pagina = desenhar();
    const marca = pagina.querySelector(".sc-vitrine__capa-marca");
    expect(marca?.getAttribute("href")).toBe("/loja/pastelaria-da-vila");
    expect(marca?.querySelector(".sc-marcador")?.textContent).toBe(
      "Pastelaria da Vila",
    );
    expect(pagina.querySelector(".sc-vitrine__capa-moldura")).toBeNull();
  });

  it("o fundo é a capa da loja; sem ela, a capa padrão do ramo", () => {
    expect(
      desenhar()
        .querySelector("img.sc-vitrine__capa-fundo")
        ?.getAttribute("src"),
    ).toBe("/demo/capa.webp");
    const padrao = desenhar({ capa: null }).querySelector<HTMLElement>(
      ".sc-vitrine__capa-fundo",
    );
    expect(padrao?.tagName).toBe("SPAN");
    expect(padrao?.style.getPropertyValue("--capa-url")).toContain(
      "/capas-padrao/food_snack.svg",
    );
  });

  it("embaixo do nome, alinhados: o título da página e só ABERTO ou FECHADO com o LED", () => {
    const aberta = desenhar();
    expect(aberta.querySelector("h1")?.textContent).toBe(
      "Cardápio de Pastelaria da Vila",
    );
    const situacao = aberta.querySelector(".sc-vitrine__capa-situacao");
    expect(situacao?.textContent).toBe("Aberto");
    expect(situacao?.className).toContain("--aberta");

    const fechada = desenhar({
      abertura: {
        aberta: false,
        proximaAbertura: "abre hoje às 18h",
        motivo: "FORA_DO_HORARIO",
      },
    }).querySelector(".sc-vitrine__capa-situacao");
    expect(fechada?.className).toContain("--fechada");
    // O "quando abre" fica para o leitor de tela, fora da vista.
    expect(fechada?.textContent).toBe("Fechado, abre hoje às 18h");
  });

  it("o Sobre é o 'i' do canto, que abre a janela do Sobre", () => {
    const sobre = desenhar().querySelector("[data-abre-sobre]");
    expect(sobre?.getAttribute("href")).toBe("/loja/pastelaria-da-vila/sobre");
    expect(sobre?.getAttribute("aria-label")).toBe("Sobre Pastelaria da Vila");
  });

  it("o nome leva a quantidade de letras (para caber numa linha no celular) e o nome inteiro no title", () => {
    const nome = desenhar().querySelector<HTMLElement>(
      ".sc-vitrine__capa-nome",
    );
    expect(nome?.style.getPropertyValue("--letras-do-nome")).toBe("18");
    expect(nome?.getAttribute("title")).toBe("Pastelaria da Vila");
  });

  it("nome comprido ganha letra menor, em vez de ser cortado", () => {
    const nome = desenhar({
      nomeDaLoja: "Pastelaria e Lanchonete da Vila Esperança",
    }).querySelector(".sc-vitrine__capa-nome");
    expect(nome?.className).toContain("sc-vitrine__capa-nome--longo");
    expect(nome?.textContent).toBe("Pastelaria e Lanchonete da Vila Esperança");
  });
});
