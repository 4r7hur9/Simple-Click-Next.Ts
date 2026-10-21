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

import {
  cruzarAcertos,
  dicionarioDoRamo,
  MAXIMO_DE_PALAVRAS,
  MAXIMO_DO_TERMO,
  normalizarTexto,
  palavrasDaBusca,
  prepararTermo,
  singular,
} from "./busca.usecase.ts";

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

describe("os filtros da vitrine se cruzam (card #59)", () => {
  it("nenhum filtro pedido devolve o catálogo inteiro", () => {
    expect(cruzarAcertos(undefined, undefined)).toBeUndefined();
    expect(cruzarAcertos()).toBeUndefined();
  });

  it("filtro não pedido não restringe", () => {
    expect(cruzarAcertos(undefined, ["a", "b"])).toEqual(["a", "b"]);
  });

  it("filtro pedido sem acerto zera o resultado", () => {
    expect(cruzarAcertos(["a", "b"], [])).toEqual([]);
  });

  it("texto, especificação e atacado juntos: só quem está nos três, na ordem da busca", () => {
    expect(
      cruzarAcertos(["c", "a", "b"], ["a", "b", "c", "d"], ["b", "c"]),
    ).toEqual(["c", "b"]);
  });
});

describe("o termo vira palavras tolerantes, com o dicionário do ramo (card #75)", () => {
  const autopecas = dicionarioDoRamo("AUTO_PARTS");
  const padroes = (termo: string) =>
    palavrasDaBusca(termo, autopecas).map((p) => p.padrao);

  it("normaliza como o banco: sem acento, minúsculas, pontuação vira espaço", () => {
    expect(normalizarTexto("  Maçaneta  EXT./Para-Choque ")).toBe(
      "macaneta ext para choque",
    );
  });

  it("leva o plural ao singular aproximado", () => {
    expect(singular("pastilhas")).toBe("pastilha");
    expect(singular("amortecedores")).toBe("amortecedor");
    expect(singular("botoes")).toBe("botao");
    expect(singular("abs")).toBe("abs");
    expect(singular("c3")).toBe("c3");
  });

  it("'pastilha' procura também 'PAST' como palavra inteira", () => {
    expect(padroes("pastilha")).toEqual(["( pastilha| past )"]);
  });

  it("'past' procura também 'pastilha' pelo começo", () => {
    expect(padroes("PAST")).toEqual(["( past| pastilha)"]);
  });

  it("abreviação curta casa só inteira; a longa, pelo começo", () => {
    expect(padroes("retentor")).toEqual(["( retentor| ret )"]);
    expect(padroes("retrovisor")).toEqual(["( retrovisor| retrov)"]);
  });

  it("o plural acha o grupo do singular", () => {
    expect(padroes("pastilhas")).toEqual(["( pastilhas| pastilha| past )"]);
  });

  it("expressão de duas palavras do dicionário vira uma palavra só", () => {
    expect(palavrasDaBusca("para-choque gol", autopecas).map((p) => p.palavra))
      .toEqual(["para choque", "gol"]);
  });

  it("tira as palavras vazias, mas não se só sobrarem elas", () => {
    expect(palavrasDaBusca("filtro de oleo", autopecas).map((p) => p.palavra))
      .toEqual(["filtro", "oleo"]);
    expect(palavrasDaBusca("de", autopecas).map((p) => p.palavra)).toEqual([
      "de",
    ]);
  });

  it("sem dicionário (outro ramo), só a palavra e o singular", () => {
    expect(palavrasDaBusca("pastilhas", dicionarioDoRamo("FOOD")).map((p) => p.padrao))
      .toEqual(["( pastilhas| pastilha)"]);
  });

  it("limita o número de palavras", () => {
    const muitas = Array.from({ length: 20 }, (_, i) => `p${i}`).join(" ");
    expect(palavrasDaBusca(muitas)).toHaveLength(MAXIMO_DE_PALAVRAS);
  });

  it("a palavra exata só pesa na ordem", () => {
    expect(palavrasDaBusca("Gol", autopecas)[0]?.exata).toBe("( gol )");
  });
});
