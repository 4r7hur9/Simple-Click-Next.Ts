// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import VitrineDoDesignSystem from "../src/app/(dev)/ui/page";

/**
 * Catálogo `/ui` (card #104, T-10409): cada peça nova da base visual aparece em
 * cada estado, no tema claro, no escuro e dentro de uma loja com cor própria,
 * com exemplos de ramos variados e nada do Stitch.
 */

let html = "";
let paineis: HTMLElement[] = [];

beforeAll(() => {
  html = renderToStaticMarkup(<VitrineDoDesignSystem />);
  document.body.innerHTML = html;
  const secao = document
    .getElementById("secao-base-visual")
    ?.closest("section");
  paineis = [...(secao?.querySelectorAll<HTMLElement>(".sc-raiz") ?? [])];
});

const todos = (painel: HTMLElement, seletor: string): HTMLElement[] => [
  ...painel.querySelectorAll<HTMLElement>(seletor),
];

describe("seção da base visual no catálogo", () => {
  it("[CA-18] @spec:AC-10418 existe e tem um painel para o tema claro, um para o escuro e um dentro da loja", () => {
    expect(document.getElementById("secao-base-visual")).not.toBeNull();
    expect(paineis).toHaveLength(3);
    expect(paineis[0]?.getAttribute("data-tema")).toBe("claro");
    expect(paineis[1]?.getAttribute("data-tema")).toBe("escuro");
    // O terceiro está dentro do envelope da loja, que segue o tema do aparelho
    // (não fixa data-tema, card #131) e NÃO traz cor própria.
    const envelope = paineis[2]?.closest(
      "[data-contraste-ajustado], .sc-tema-loja",
    );
    expect(envelope).not.toBeNull();
    expect(envelope?.hasAttribute("data-tema")).toBe(false);
    expect(paineis[2]?.closest("[data-tema]")).toBeNull();
    expect(envelope?.getAttribute("style") ?? "").not.toMatch(/--cor-/);
  });

  it("[CA-18] @spec:AC-10418 a página continua declarando 344px e os dois temas", () => {
    expect(html).toContain('data-largura-minima="344px"');
    expect(html).toContain('data-temas="claro escuro"');
  });

  for (const indice of [0, 1, 2]) {
    const nome = ["tema claro", "tema escuro", "loja"][indice] ?? "";

    it(`[CA-18] @spec:AC-10418 (${nome}) botão principal do cliente em repouso, carregando e desabilitado`, () => {
      const painel = paineis[indice] as HTMLElement;
      const botoes = todos(painel, ".sc-botao--cta");
      expect(botoes.length).toBeGreaterThanOrEqual(3);
      expect(botoes.some((b) => b.getAttribute("aria-busy") === "true")).toBe(
        true,
      );
      expect(botoes.some((b) => (b as HTMLButtonElement).disabled)).toBe(true);
      expect(botoes.some((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
    });

    it(`[CA-18] @spec:AC-10418 (${nome}) botão marcável marcado e desmarcado, e os ícones de ação`, () => {
      const painel = paineis[indice] as HTMLElement;
      expect(
        todos(painel, '.sc-botao--marcavel[aria-pressed="true"]').length,
      ).toBeGreaterThanOrEqual(2);
      expect(
        todos(painel, '.sc-botao--marcavel[aria-pressed="false"]').length,
      ).toBeGreaterThanOrEqual(2);
      expect(todos(painel, ".lucide-share-2").length).toBeGreaterThanOrEqual(2);
      expect(
        todos(painel, ".sc-icone-estrela[data-preenchido]").length,
      ).toBeGreaterThanOrEqual(2);
      expect(
        todos(painel, "svg[data-preenchido]:not(.lucide)").length,
      ).toBeGreaterThanOrEqual(2);
      expect(painel.innerHTML).not.toMatch(/heart/i);
    });

    it(`[CA-18] @spec:AC-10418 (${nome}) campo de busca normal, com erro e desabilitado, sempre com rótulo`, () => {
      const painel = paineis[indice] as HTMLElement;
      const buscas = todos(painel, ".sc-campo--busca");
      expect(buscas).toHaveLength(3);
      expect(
        todos(painel, 'input[type="search"][aria-invalid="true"]'),
      ).toHaveLength(1);
      expect(todos(painel, 'input[type="search"][disabled]')).toHaveLength(1);
      for (const campo of buscas) {
        const entrada = campo.querySelector("input");
        expect(
          campo.querySelector(`label[for="${entrada?.id}"]`),
        ).not.toBeNull();
      }
    });

    it(`[CA-18] @spec:AC-10418 (${nome}) chips de filtro (ligado, desligado, desabilitado) e de categoria (atual)`, () => {
      const painel = paineis[indice] as HTMLElement;
      expect(
        todos(painel, '.sc-chip[aria-pressed="true"]').length,
      ).toBeGreaterThanOrEqual(1);
      expect(
        todos(painel, '.sc-chip[aria-pressed="false"]').length,
      ).toBeGreaterThanOrEqual(1);
      expect(todos(painel, ".sc-chip[disabled]")).toHaveLength(2);
      expect(todos(painel, 'a.sc-chip[aria-current="true"]')).toHaveLength(1);
      expect(todos(painel, "nav.sc-chips")).toHaveLength(1);
    });

    it(`[CA-18] @spec:AC-10418 (${nome}) abas, gaveta aberta, aviso flutuante e barra inferior`, () => {
      const painel = paineis[indice] as HTMLElement;
      expect(todos(painel, '[role="tablist"]')).toHaveLength(1);
      expect(todos(painel, '[role="tab"]')).toHaveLength(2);
      expect(todos(painel, '[role="tabpanel"]')).toHaveLength(2);

      const gaveta = todos(painel, "dialog.sc-gaveta-modal--embutida");
      expect(gaveta).toHaveLength(1);
      expect(gaveta[0]?.hasAttribute("open")).toBe(true);
      expect(gaveta[0]?.getAttribute("aria-labelledby")).toBeTruthy();

      expect(todos(painel, ".sc-aviso-flutuante")).toHaveLength(1);
      expect(todos(painel, '.sc-aviso-flutuante [role="status"]')).toHaveLength(
        1,
      );
      expect(todos(painel, '.sc-aviso-flutuante [role="alert"]')).toHaveLength(
        1,
      );
      expect(todos(painel, ".sc-aviso-flutuante__cartao")).toHaveLength(1);

      const barra = todos(painel, "nav.sc-barra-inferior");
      expect(barra).toHaveLength(1);
      expect(barra[0]?.getAttribute("aria-label")).toBeTruthy();
      expect(
        todos(painel, '.sc-barra-inferior [aria-current="page"]'),
      ).toHaveLength(1);
      expect(todos(painel, ".sc-barra-inferior__rotulo")).toHaveLength(5);
      expect(todos(painel, ".sc-barra-inferior button")).toHaveLength(1);
    });

    it(`[CA-18] @spec:AC-10418 (${nome}) cartão de vitrine, selo e a escala de letras`, () => {
      const painel = paineis[indice] as HTMLElement;
      expect(todos(painel, ".sc-cartao--vitrine")).toHaveLength(1);
      expect(todos(painel, ".sc-selo").length).toBeGreaterThanOrEqual(1);
      for (const classe of [
        "text-titulo-lg",
        "text-titulo-md",
        "text-corpo-lg",
        "text-corpo-sm",
        "text-preco",
      ]) {
        expect(
          todos(painel, `.${classe}`).length,
          classe,
        ).toBeGreaterThanOrEqual(1);
      }
    });
  }

  it("[CA-18] @spec:AC-10418 a grade de ícones mostra compartilhar, buscar, fechar, anterior, próximo, som, sem som e e-mail", () => {
    for (const classe of [
      "lucide-share-2",
      "lucide-search",
      "lucide-x",
      "lucide-chevron-left",
      "lucide-chevron-right",
      "lucide-volume-2",
      "lucide-volume-x",
      "lucide-mail",
    ]) {
      expect(paineis[0]?.querySelector(`.${classe}`), classe).not.toBeNull();
    }
  });

  it("[CA-18] @spec:AC-10418 os exemplos são de lojas de ramos variados e não trazem nada do Stitch", () => {
    for (const loja of [
      "Lanchonete do Zé",
      "Mercadinho Boa Vista",
      "Ateliê Maré",
    ]) {
      expect(html).toContain(loja);
    }
    for (const proibido of [
      /Universokar/i,
      /googleusercontent/i,
      /material[- ]symbols/i,
      /chassi|placa|OEM/i,
      /CNPJ/i,
      /tailwindcss\.com/i,
    ]) {
      expect(html).not.toMatch(proibido);
    }
  });

  it("[CA-18] @spec:AC-10418 nenhum id se repete e cada rótulo de navegação é único", () => {
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(repetidos).toEqual([]);

    const rotulos = [...document.querySelectorAll("nav[aria-label]")].map((n) =>
      n.getAttribute("aria-label"),
    );
    expect(new Set(rotulos).size).toBe(rotulos.length);
  });
});
