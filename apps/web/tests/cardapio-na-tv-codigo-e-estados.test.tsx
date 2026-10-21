// @vitest-environment jsdom
/**
 * Prova do código para o celular e dos estados da exibição do cardápio na televisão
 * (AC-931, P-011 e P-012): o código em toda tela, os quatro estados da parede e o axe.
 * Apoio comum em `apoio-da-tv.tsx`; o rodízio mora em `cardapio-na-tv.test.tsx`.
 */
import { afterEach, describe, expect, it } from "vitest";
import axe, { type Result } from "axe-core";

import type { CatalogoDaVitrineNoContrato } from "@simpleclick/contracts";

import {
  caminhoDosModulos,
  enderecoParaOCelular,
  gerarCodigo,
} from "../src/features/tv/codigo";
import {
  CATALOGO,
  comoSeLe,
  desenhar,
  desligar,
  esperar,
  FOLHA,
  ligar,
  pendente,
  produto,
  SEGUNDOS_POR_TELA,
  semRede,
  VITRINE,
} from "./apoio-da-tv.tsx";

afterEach(desligar);

describe("a tela leva o cardápio para o celular (AC-931)", () => {
  it("@spec:AC-931 o código está na tela, é grande e leva à vitrine da loja vinda da TV", () => {
    const html = desenhar();
    const esperado = caminhoDosModulos(
      gerarCodigo(enderecoParaOCelular(VITRINE)),
    );

    expect(html).toContain('role="img"');
    expect(html).toContain(
      "Código para abrir simpleclick.app/loja/sabor-e-cia/cardapio no celular",
    );
    expect(html).toContain(`d="${esperado}"`);
    // Elemento grande, e não selo de canto: 44% do lado menor da tela.
    expect(FOLHA).toMatch(/--tamanho-do-codigo:\s*44vmin/);
  });

  it("@spec:AC-931 o endereço aparece escrito, para quem prefere digitar", () => {
    expect(comoSeLe(desenhar())).toContain(
      "simpleclick.app/loja/sabor-e-cia/cardapio",
    );
    expect(comoSeLe(desenhar())).toContain("Aponte a câmera");
  });

  it("@spec:AC-931 o código fica em TODA tela do rodízio, e não só numa", async () => {
    const tela = ligar();

    for (let i = 0; i < 3; i++) {
      expect(
        tela.querySelector('svg[role="img"] path')?.getAttribute("d"),
      ).toBe(caminhoDosModulos(gerarCodigo(enderecoParaOCelular(VITRINE))));
      await esperar(SEGUNDOS_POR_TELA);
    }
  });

  it("@spec:AC-931 o código é preto sobre branco, seja qual for a cor da loja", () => {
    expect(FOLHA).toMatch(
      /\.sc-codigo__fundo\s*\{[^}]*fill:\s*var\(--cor-tinta-extrema-clara\)/,
    );
    expect(FOLHA).toMatch(
      /\.sc-codigo__modulos\s*\{[^}]*fill:\s*var\(--cor-tinta-extrema-escura\)/,
    );
  });
});

describe("os quatro estados da parede (P-011)", () => {
  it("@principle:P-011 enquanto não há catálogo nenhum, a tela diz que está carregando", () => {
    const tela = ligar({ catalogoInicial: null, buscar: pendente });

    expect(tela.querySelector('[role="status"]')?.textContent).toContain(
      "Carregando o cardápio",
    );
  });

  it("@principle:P-011 sem catálogo e sem rede, a tela mostra erro e promete tentar sozinha", async () => {
    const tela = ligar({ catalogoInicial: null, buscar: async () => semRede });
    await esperar(0);

    const alerta = tela.querySelector('[role="alert"]');
    expect(alerta?.textContent).toContain("não carregou");
    expect(alerta?.textContent).toContain("sozinha");
    expect(tela.querySelector("button")).toBeNull();
  });

  it("@principle:P-011 catálogo sem produto disponível explica que está sendo montado", () => {
    const vazio: CatalogoDaVitrineNoContrato = {
      secoes: [
        {
          ...CATALOGO.secoes[0]!,
          produtos: [produto({ disponivel: false })],
        },
      ],
      destaques: [],
      versao: "1",
    };
    const lido = comoSeLe(desenhar({ catalogoInicial: vazio }));

    expect(lido).toContain("está sendo montado");
    expect(lido).not.toContain("Coxinha");
  });

  it("@principle:P-011 com catálogo, a tela mostra o rodízio", () => {
    expect(comoSeLe(desenhar())).toContain("Coxinha");
  });
});

describe("acessibilidade da exibição (P-012)", () => {
  const NIVEIS_QUE_REPROVAM = new Set(["critical", "serious"]);
  const descrever = (violacao: Result): string =>
    `${violacao.impact}: ${violacao.id} — ${violacao.help} (${violacao.nodes
      .map((no) => no.target.join(" "))
      .slice(0, 3)
      .join(" · ")})`;

  async function avaliar(html: string): Promise<axe.AxeResults> {
    document.documentElement.lang = "pt-BR";
    document.title = "Cardápio na TV · Sabor & Cia";
    document.body.className = "sc-raiz";
    document.body.innerHTML = html;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => null,
    });
    const resultado = await axe.run(document, {
      rules: { "color-contrast": { enabled: false } },
    });
    document.body.innerHTML = "";
    return resultado;
  }

  it("@spec:AC-926 @principle:P-012 sem violação crítica nem séria, no rodízio e nos estados", async () => {
    for (const html of [
      desenhar(),
      desenhar({ catalogoInicial: { secoes: [], destaques: [], versao: "1" } }),
    ]) {
      const resultado = await avaliar(html);
      const avaliadas = resultado.passes.length + resultado.violations.length;
      expect(avaliadas).toBeGreaterThan(0);
      const graves = resultado.violations.filter((violacao) =>
        NIVEIS_QUE_REPROVAM.has(violacao.impact ?? ""),
      );
      expect(graves.map(descrever)).toEqual([]);
    }
  });

  it("@principle:P-012 os títulos não pulam nível e o código tem nome acessível", () => {
    const html = desenhar();

    expect(html).toContain("<h1");
    expect(html).toContain("<h2");
    expect(html).not.toContain("<h3");
    expect(html).toMatch(/<svg[^>]*aria-label="Código para abrir/);
  });

  it("@principle:P-012 quem pediu menos movimento recebe a tela nova inteira, sem animação", () => {
    expect(FOLHA).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.sc-exibicao__lista[^}]*\{\s*animation:\s*none/,
    );
  });
});
