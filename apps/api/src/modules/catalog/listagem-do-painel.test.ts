import { describe, expect, it } from "vitest";

import {
  esquemaDaConsultaDeProdutos,
  expressaoDaBusca,
  lerConsulta,
  pedePagina,
} from "./listagem-do-painel.ts";

describe("a busca das listas do painel (card #76)", () => {
  it("ignora acento e caixa com classes de letra, também nas maiúsculas acentuadas", () => {
    const expressao = new RegExp(expressaoDaBusca("Açaí"), "i");
    expect(expressao.source).toBe("[aáàâãäÁÀÂÃÄ][cçÇ][aáàâãäÁÀÂÃÄ][iíìîïÍÌÎÏ]");
    expect(expressao.test("CAMISETA AÇAÍ")).toBe(true);
    expect(expressao.test("acai na tigela")).toBe(true);
    expect(expressao.test("caju")).toBe(false);
  });

  it("escapa o que é especial em expressão regular", () => {
    const expressao = new RegExp(expressaoDaBusca("9x13 (c/2)."), "i");
    expect(expressao.test("ABRACADEIRA 9X13 (C/2). ROSCA")).toBe(true);
    expect(expressao.test("9x13 c/2")).toBe(false);
  });
});

describe("a consulta da lista", () => {
  it("só pagina quando a tela pede, e consulta torta cai no padrão", () => {
    expect(pedePagina({})).toBe(false);
    expect(pedePagina({ pagina: "2" })).toBe(true);
    expect(pedePagina({ busca: "x" })).toBe(true);
    expect(
      lerConsulta(esquemaDaConsultaDeProdutos, {
        pagina: "abc",
        porPagina: "5000",
        ordem: "preco-desc",
        situacao: "zzz",
        categoria: "nao-e-uuid",
        busca: ["  filtro  ", "outro"],
      }),
    ).toEqual({
      pagina: 1,
      porPagina: 50,
      busca: "filtro",
      categoria: "",
      situacao: "",
      marca: "",
      estoque: "",
      video: "",
      feed: "",
      precoMin: "",
      precoMax: "",
      ordem: "preco-desc",
    });
  });

  it("lê os filtros novos (estoque, vídeo, feed, faixa de preço) e as ordens novas (card #77)", () => {
    expect(pedePagina({ video: "com" })).toBe(true);
    expect(pedePagina({ precoMax: "5000" })).toBe(true);
    const consulta = lerConsulta(esquemaDaConsultaDeProdutos, {
      estoque: "esgotado",
      video: "com",
      feed: "nao",
      precoMin: "1000",
      precoMax: "5000",
      situacao: "indisponivel",
      ordem: "vendidos",
    });
    expect(consulta).toMatchObject({
      estoque: "esgotado",
      video: "com",
      feed: "nao",
      precoMin: 1000,
      precoMax: 5000,
      situacao: "indisponivel",
      ordem: "vendidos",
    });
    // Torto vira "sem filtro", e não erro.
    expect(
      lerConsulta(esquemaDaConsultaDeProdutos, {
        estoque: "x",
        video: "talvez",
        precoMin: "barato",
        precoMax: "-5",
        ordem: "estoque-desc",
      }),
    ).toMatchObject({
      estoque: "",
      video: "",
      precoMin: "",
      precoMax: "",
      ordem: "estoque-desc",
    });
  });
});
