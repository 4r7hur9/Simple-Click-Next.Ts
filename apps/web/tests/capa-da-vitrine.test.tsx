// @vitest-environment jsdom
/**
 * Prova da capa do cardápio e da frase de situação da loja (AC-404, AC-401).
 *
 * A capa é desenhada por `renderToStaticMarkup`: é o que o servidor entrega
 * antes de qualquer script, e é onde mora o `h1` da página do cardápio.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CapaDaVitrine } from "../src/features/vitrine/CapaDaVitrine";
import { fraseDaSituacao } from "../src/lib/situacao-da-loja";

describe("a capa do cardápio (AC-404)", () => {
  it("@spec:AC-404 traz o nome da loja, o título do catálogo como h1 e a situação", () => {
    const html = renderToStaticMarkup(
      <CapaDaVitrine
        nomeDaLoja="Sabor & Cia"
        rotuloDoCatalogo="Cardápio"
        abertura={{ aberta: true, proximaAbertura: null, motivo: "ABERTA" }}
        boasVindas="Comida caseira todo dia"
      />,
    );

    expect(html).toContain("Sabor &amp; Cia");
    expect(html).toMatch(/<h1[^>]*>.*Cardápio.*<\/h1>/);
    expect(html).toContain("Aberta agora");
    expect(html).toContain("Comida caseira todo dia");
  });

  it("@spec:AC-404 o título usa a palavra do RAMO, com o marcador da marca", () => {
    const html = renderToStaticMarkup(
      <CapaDaVitrine
        nomeDaLoja="Moda Boa Vista"
        rotuloDoCatalogo="Catálogo"
        abertura={{ aberta: true, proximaAbertura: null, motivo: "ABERTA" }}
      />,
    );

    expect(html).toContain('class="sc-marcador"');
    expect(html).toContain("Catálogo");
    expect(html).not.toContain("Cardápio");
  });

  it("@spec:AC-404 sem boas-vindas, não sobra parágrafo vazio", () => {
    const html = renderToStaticMarkup(
      <CapaDaVitrine
        nomeDaLoja="Sabor & Cia"
        rotuloDoCatalogo="Cardápio"
        abertura={{ aberta: true, proximaAbertura: null, motivo: "ABERTA" }}
      />,
    );

    expect(html).not.toContain("sc-capa__frase");
  });
});

describe("a frase da situação é uma só para todas as telas (AC-401)", () => {
  it("@spec:AC-401 aberta diz 'Aberta agora'", () => {
    expect(
      fraseDaSituacao({
        aberta: true,
        proximaAbertura: null,
        motivo: "ABERTA",
      }),
    ).toBe("Aberta agora");
  });

  it("@spec:AC-401 fechada diz quando abre", () => {
    expect(
      fraseDaSituacao({
        aberta: false,
        proximaAbertura: "abre hoje às 18h",
        motivo: "FORA_DO_HORARIO",
      }),
    ).toBe("Fechada agora · abre hoje às 18h");
  });

  it("@spec:AC-401 fechada por exceção diz o motivo que o dono escreveu", () => {
    expect(
      fraseDaSituacao({
        aberta: false,
        proximaAbertura: "abre terça às 11h",
        motivo: "EXCECAO",
        explicacaoDaExcecao: "Feriado municipal",
      }),
    ).toBe("Feriado municipal · abre terça às 11h");
  });

  it("@spec:AC-401 sem previsão, diz que não há horário em vez de inventar", () => {
    expect(
      fraseDaSituacao({
        aberta: false,
        proximaAbertura: null,
        motivo: "FORA_DO_HORARIO",
      }),
    ).toBe("Fechada agora · horário não informado");
  });
});
