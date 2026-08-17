import { describe, expect, it } from "vitest";
import {
  CONTRASTE_MINIMO_TEXTO,
  ajustarParaContraste,
  contrasteSuficienteParaTexto,
  emHex,
  lerCor,
  luminanciaRelativa,
  misturar,
  relacaoDeContraste,
  textoLegivelSobre,
} from "../src/contraste";

/**
 * O cálculo de contraste é a peça que decide se a loja fica legível (AC-015).
 * Por isso ele é conferido contra valores que a própria especificação do WCAG
 * fixa — e não contra o que a implementação por acaso devolveu.
 */
describe("relação de contraste do WCAG", () => {
  it("@spec:AC-015 mede luminância nos extremos com os valores da especificação", () => {
    expect(luminanciaRelativa("#ffffff")).toBeCloseTo(1, 5);
    expect(luminanciaRelativa("#000000")).toBeCloseTo(0, 5);
    // O verde pesa mais que o azul porque o olho enxerga mais verde: é isso
    // que separa um cálculo de verdade de uma média dos três canais.
    expect(luminanciaRelativa("#00ff00")).toBeGreaterThan(
      luminanciaRelativa("#0000ff"),
    );
  });

  it("@spec:AC-015 devolve 21:1 entre preto e branco, e 1:1 entre cores iguais", () => {
    expect(relacaoDeContraste("#000000", "#ffffff")).toBeCloseTo(21, 2);
    expect(relacaoDeContraste("#ffffff", "#000000")).toBeCloseTo(21, 2);
    expect(relacaoDeContraste("#1a4fd6", "#1a4fd6")).toBeCloseTo(1, 5);
  });

  it("@spec:AC-015 confere contra relações conhecidas de pares reais", () => {
    // #767676 sobre branco é o exemplo canônico do limite de 4,5:1.
    expect(relacaoDeContraste("#767676", "#ffffff")).toBeCloseTo(4.54, 1);
    expect(relacaoDeContraste("#ffe066", "#ffffff")).toBeCloseTo(1.31, 1);
  });

  it("@spec:AC-015 lê a cor nos formatos que um seletor de cor produz", () => {
    expect(lerCor("#fff")).toEqual({ vermelho: 255, verde: 255, azul: 255 });
    expect(lerCor("#1A4FD6")).toEqual({ vermelho: 26, verde: 79, azul: 214 });
    expect(lerCor("rgb(26, 79, 214)")).toEqual({
      vermelho: 26,
      verde: 79,
      azul: 214,
    });
    expect(emHex(lerCor("rgb(26 79 214)"))).toBe("#1a4fd6");
  });

  it("@spec:AC-015 recusa cor que não entende em vez de fingir que é preto", () => {
    // Trocar em silêncio por preto passaria no cálculo de contraste e entregaria
    // à loja uma identidade que ninguém escolheu.
    expect(() => lerCor("azul da loja")).toThrow(/não reconhecida/i);
    expect(() => lerCor("")).toThrow();
  });
});

describe("escolha da cor de texto sobre a cor da loja", () => {
  it("@spec:AC-015 mantém a letra clara quando ela já se lê sobre a cor escolhida", () => {
    const escolha = textoLegivelSobre("#0f766e", ["#ffffff", "#14171c"]);

    expect(escolha.cor).toBe("#ffffff");
    expect(escolha.suficiente).toBe(true);
    expect(escolha.relacao).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
  });

  it("@spec:AC-015 troca para a letra escura quando a clara ficaria ilegível", () => {
    // Amarelo claro com letra branca é o caso que derrubava a vitrine do v1.
    expect(contrasteSuficienteParaTexto("#ffffff", "#ffe066")).toBe(false);

    const escolha = textoLegivelSobre("#ffe066", ["#ffffff", "#14171c"]);

    expect(escolha.cor).toBe("#14171c");
    expect(escolha.suficiente).toBe(true);
    expect(escolha.relacao).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
  });

  it("@spec:AC-015 exige ao menos uma candidata, em vez de devolver algo por acaso", () => {
    expect(() => textoLegivelSobre("#ffffff", [])).toThrow(/candidata/i);
  });
});

describe("ajuste da cor até ela alcançar o contraste mínimo", () => {
  it("@spec:AC-015 não mexe na cor que já passa", () => {
    const ajuste = ajustarParaContraste("#1a4fd6", "#ffffff");

    expect(ajuste.ajustada).toBe(false);
    expect(ajuste.cor).toBe("#1a4fd6");
  });

  it("@spec:AC-015 escurece a cor clara até ela se ler sobre fundo claro", () => {
    const ajuste = ajustarParaContraste("#ffe066", "#ffffff");

    expect(ajuste.ajustada).toBe(true);
    expect(ajuste.relacao).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
    expect(relacaoDeContraste(ajuste.cor, "#ffffff")).toBeGreaterThanOrEqual(
      CONTRASTE_MINIMO_TEXTO,
    );
    // Escurecer não pode virar apagar: a cor da loja continua reconhecível.
    expect(ajuste.cor).not.toBe("#000000");
    expect(luminanciaRelativa(ajuste.cor)).toBeGreaterThan(0);
  });

  it("@spec:AC-015 clareia a cor escura quando o fundo é escuro", () => {
    const ajuste = ajustarParaContraste("#141d2e", "#0d1015");

    expect(ajuste.ajustada).toBe(true);
    expect(luminanciaRelativa(ajuste.cor)).toBeGreaterThan(
      luminanciaRelativa("#141d2e"),
    );
    expect(ajuste.relacao).toBeGreaterThanOrEqual(CONTRASTE_MINIMO_TEXTO);
  });

  it("@spec:AC-015 mexe o mínimo necessário: um passo a menos já reprovaria", () => {
    const ajuste = ajustarParaContraste("#ffe066", "#ffffff");
    // Um passo de volta na direção da cor original derruba o contraste abaixo
    // do piso — prova de que a busca parou no primeiro ponto que serve, e não
    // saltou direto para o extremo.
    const umPassoAtras = misturar(ajuste.cor, "#ffe066", 0.08);

    expect(relacaoDeContraste(umPassoAtras, "#ffffff")).toBeLessThan(
      CONTRASTE_MINIMO_TEXTO,
    );
  });

  it("@spec:AC-015 alcança qualquer piso pedido, inclusive o de elemento gráfico", () => {
    const grafico = ajustarParaContraste("#ffe066", "#ffffff", 3);

    expect(grafico.relacao).toBeGreaterThanOrEqual(3);
    // O piso menor exige menos conserto: a cor fica mais perto da escolhida.
    const texto = ajustarParaContraste("#ffe066", "#ffffff", 4.5);
    expect(luminanciaRelativa(grafico.cor)).toBeGreaterThan(
      luminanciaRelativa(texto.cor),
    );
  });
});
