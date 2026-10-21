import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Campo } from "../src/campo";
import { descritoresDoCampo } from "../src/campo-descritores";
import { Info, lerConteudoDoInfo } from "../src/info";
import {
  calcularPosicaoDoBalao,
  larguraMaximaDoBalao,
  type Retangulo,
} from "../src/info-posicao";

const CSS = readFileSync(
  fileURLToPath(new URL("../styles/info.css", import.meta.url)),
  "utf8",
);

/** O "i" de 24px numa posição da tela. */
function icone(left: number, top: number): Retangulo {
  return { left, top, width: 24, height: 24 };
}

const DESKTOP = { largura: 1400, altura: 900 };
const CELULAR = { largura: 390, altura: 844 };

/** Não há dois retângulos com área em comum. */
function semSobrepor(a: Retangulo, b: Retangulo): boolean {
  return (
    a.left + a.width <= b.left ||
    b.left + b.width <= a.left ||
    a.top + a.height <= b.top ||
    b.top + b.height <= a.top
  );
}

describe("posição do balão", () => {
  it("abre acima do ícone, centralizado nele, com a seta no centro", () => {
    const p = calcularPosicaoDoBalao({
      ancora: icone(600, 400),
      balao: { largura: 300, altura: 120 },
      tela: DESKTOP,
    });
    expect(p.lado).toBe("cima");
    expect(p.top + p.alturaMaxima).toBeLessThanOrEqual(400);
    expect(p.left).toBe(612 - 150);
    expect(p.setaX).toBe(150);
  });

  it("vira para baixo (flip) quando em cima não cabe", () => {
    const p = calcularPosicaoDoBalao({
      ancora: icone(600, 40),
      balao: { largura: 300, altura: 120 },
      tela: DESKTOP,
    });
    expect(p.lado).toBe("baixo");
    expect(p.top).toBeGreaterThanOrEqual(40 + 24);
  });

  it("escorrega para dentro (shift) na borda direita e a seta segue o ícone", () => {
    const ancora = icone(360, 300);
    const p = calcularPosicaoDoBalao({
      ancora,
      balao: { largura: 320, altura: 100 },
      tela: CELULAR,
    });
    expect(p.largura).toBe(320);
    expect(p.left).toBe(390 - 16 - 320);
    expect(p.left + p.setaX).toBeCloseTo(
      Math.min(372, p.left + p.largura - 14),
    );
  });

  it("escorrega na borda esquerda", () => {
    const p = calcularPosicaoDoBalao({
      ancora: icone(4, 300),
      balao: { largura: 280, altura: 100 },
      tela: CELULAR,
    });
    expect(p.left).toBe(16);
    expect(p.setaX).toBe(14);
  });

  it("no celular nunca passa da largura da tela menos 2rem", () => {
    expect(larguraMaximaDoBalao(320)).toBe(288);
    expect(larguraMaximaDoBalao(390)).toBe(320);
    expect(larguraMaximaDoBalao(1400)).toBe(320);
    for (let x = 0; x <= 366; x += 15) {
      const p = calcularPosicaoDoBalao({
        ancora: icone(x, 500),
        balao: { largura: 400, altura: 140 },
        tela: CELULAR,
      });
      expect(p.left).toBeGreaterThanOrEqual(16);
      expect(p.left + p.largura).toBeLessThanOrEqual(390 - 16);
      expect(p.top).toBeGreaterThanOrEqual(16);
    }
  });

  it("não cobre o ícone nem o controle logo abaixo do rótulo", () => {
    const ancora = icone(120, 300);
    // O controle começa 8px abaixo da linha do rótulo e tem 44px.
    const controle = { left: 16, top: 332, width: 358, height: 44 };
    const p = calcularPosicaoDoBalao({
      ancora,
      balao: { largura: 300, altura: 140 },
      tela: CELULAR,
    });
    const caixa = {
      left: p.left,
      top: p.top,
      width: p.largura,
      height: p.alturaMaxima,
    };
    expect(semSobrepor(caixa, ancora)).toBe(true);
    expect(semSobrepor(caixa, controle)).toBe(true);
  });

  it("sem espaço em lado nenhum, fica no maior e limita a altura", () => {
    const p = calcularPosicaoDoBalao({
      ancora: icone(100, 200),
      balao: { largura: 300, altura: 900 },
      tela: { largura: 390, altura: 500 },
    });
    expect(p.lado).toBe("baixo");
    expect(p.top + p.alturaMaxima).toBeLessThanOrEqual(500 - 16);
  });
});

describe("Info", () => {
  it("é um botão com nome, fechado, e o texto para o leitor de tela", () => {
    const html = renderToStaticMarkup(
      <Info
        id="acrescimo"
        rotulo="Acréscimo (R$)"
        conteudo={{
          titulo: "Acréscimo",
          texto: "Valor somado ao preço quando o cliente escolhe esta opção.",
          exemplo: "Ex.: borda recheada + R$ 8,00",
        }}
      />,
    );
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Saiba mais sobre Acréscimo (R$)"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-describedby="acrescimo-info"');
    expect(html).toContain('id="acrescimo-info"');
    // Exemplo com "Ex.:" duplicado vira um só.
    expect(html).toContain("Ex.: borda recheada + R$ 8,00");
    expect(html).not.toContain("Ex.: Ex.:");
    expect(html).not.toContain('role="tooltip"');
  });

  it("aceita só uma frase", () => {
    expect(lerConteudoDoInfo("Só texto.")).toEqual({
      titulo: undefined,
      texto: "Só texto.",
      exemplo: undefined,
    });
  });

  it("o CSS não põe o botão em cima de nada", () => {
    const botao = CSS.match(/\.sc-info__botao\s*\{[^}]*\}/)?.[0] ?? "";
    expect(botao).not.toMatch(/position\s*:/);
    expect(CSS).toMatch(/\.sc-info__botao\s*\{[^}]*width:\s*1\.5rem/);
    expect(CSS).toMatch(/max-width:\s*min\(20rem,\s*calc\(100vw - 2rem\)\)/);
    expect(CSS).not.toContain("backdrop-filter");
  });
});

describe("Campo com info", () => {
  it("põe o i fora do rótulo, na mesma linha, e liga o texto no controle", () => {
    const html = renderToStaticMarkup(
      <Campo
        id="peso"
        rotulo="Peso (kg)"
        dica="Use ponto ou vírgula."
        info="Peso do produto embalado. Serve para calcular o frete."
      />,
    );
    expect(html).toMatch(
      /<div class="sc-campo__cabeca"><label class="sc-campo__rotulo" for="peso">Peso \(kg\)<\/label><span class="sc-info">/,
    );
    expect(html).toContain('aria-describedby="peso-info peso-dica"');
    expect(html).toContain('id="peso-dica"');
  });

  it("sem info, o campo continua igual", () => {
    const html = renderToStaticMarkup(<Campo id="nome" rotulo="Nome" />);
    expect(html).not.toContain("sc-campo__cabeca");
    expect(html).not.toContain("sc-info");
    expect(descritoresDoCampo("x", { info: true, erro: "e" })).toEqual([
      "x-info",
      "x-erro",
    ]);
  });
});
