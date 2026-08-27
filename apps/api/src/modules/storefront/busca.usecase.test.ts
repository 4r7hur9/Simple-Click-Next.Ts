/**
 * Prova do preparo do termo de busca (AC-408).
 *
 * SEM BANCO, de propósito: o que este arquivo prova é o que acontece ANTES da
 * consulta — o que é aceito, o que vira "sem busca" e onde o termo é cortado. O
 * casamento em si depende do índice de texto do PostgreSQL e da regra de acento
 * da migração 0021, e está provado contra banco de verdade em
 * `apps/api/tests/busca-vitrine.int.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { MAXIMO_DO_TERMO, prepararTermo } from "./busca.usecase.ts";

describe("o termo da busca é preparado antes de chegar ao banco (AC-408)", () => {
  it("@spec:AC-408 aceita o termo digitado", () => {
    expect(prepararTermo("coxinha")).toBe("coxinha");
  });

  it("@spec:AC-408 tira o espaço das pontas, que sobra de colar e do teclado do celular", () => {
    expect(prepararTermo("  pão de queijo  ")).toBe("pão de queijo");
  });

  it.each([
    ["vazio", ""],
    ["só espaço", "   "],
    ["só quebra de linha", "\n\t"],
  ])(
    "@spec:AC-408 trata %s como ausência de busca, e não como busca por nada",
    (_nome, bruto) => {
      // A DIFERENÇA É A TELA INTEIRA: nulo devolve o catálogo completo; string
      // vazia devolveria zero produtos e a loja pareceria vazia para quem só
      // apertou "buscar" sem digitar.
      expect(prepararTermo(bruto)).toBeNull();
    },
  );

  it("@spec:AC-408 corta o termo comprido em vez de recusá-lo", () => {
    const comprido = "a".repeat(MAXIMO_DO_TERMO + 40);

    // CORTA, e não devolve erro: quem colou um parágrafo no campo de busca não
    // cometeu uma infração — errou o campo. Cortar mostra um resultado; recusar
    // mostra uma mensagem de erro numa vitrine.
    expect(prepararTermo(comprido)).toHaveLength(MAXIMO_DO_TERMO);
  });

  it("@spec:AC-408 apara antes de cortar, para o limite contar o que foi digitado", () => {
    const bruto = `${" ".repeat(10)}${"b".repeat(MAXIMO_DO_TERMO)}`;

    // Dez espaços colados na frente não podem comer dez letras do termo: quem
    // digitou sessenta caracteres recebe os sessenta de volta.
    expect(prepararTermo(bruto)).toBe("b".repeat(MAXIMO_DO_TERMO));
  });

  it("@spec:AC-408 não devolve o espaço que o próprio corte deixou no fim", () => {
    const bruto = `${"c".repeat(MAXIMO_DO_TERMO - 1)} depois do corte`;

    // O corte cai num espaço, e um termo terminado em espaço iria assim para o
    // analisador e voltaria assim para o campo — o cursor uma casa adiante do
    // que a pessoa escreveu.
    expect(prepararTermo(bruto)).toBe("c".repeat(MAXIMO_DO_TERMO - 1));
  });
});
