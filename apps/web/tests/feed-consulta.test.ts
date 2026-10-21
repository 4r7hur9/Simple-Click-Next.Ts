/**
 * Prova da consulta do feed (card #37): o endereço vira a consulta da API, os
 * links mudam um filtro e voltam à página 1, valor estranho vira padrão, e as
 * pílulas de tipo de negócio juntam os ramos de comida.
 */
import { describe, expect, it } from "vitest";

import {
  categoriasDoFeed,
  consultaDaApi,
  enderecoDoFeed,
  escreverDistancia,
  escreverFormas,
  filtrarLojasDaConta,
  lerConsulta,
  ordemEfetiva,
  totalDePaginas,
} from "../src/features/feed/consulta.ts";

describe("lerConsulta", () => {
  it("lê os filtros do endereço", () => {
    const c = lerConsulta("produtos", {
      tipo: "food_snack,FOOD_ACAI",
      categoria: "Bebidas",
      entrega: "retirada",
      busca: "  pastel ",
      ordem: "preco-menor",
      lat: "-23.5",
      lng: "-46.6",
      pagina: "3",
    });
    expect(c).toMatchObject({
      aba: "produtos",
      tipo: "FOOD_SNACK,FOOD_ACAI",
      categoria: "Bebidas",
      entrega: "retirada",
      busca: "pastel",
      ordem: "preco-menor",
      lat: -23.5,
      lng: -46.6,
      pagina: 3,
      lista: "todas",
    });
  });

  it("valor estranho vira o padrão, sem quebrar", () => {
    const c = lerConsulta("lojas", {
      tipo: "<script>",
      entrega: "drone",
      ordem: "preco-menor", // não existe para lojas
      lat: "999",
      lng: "-46",
      pagina: "abc",
      lista: "todas-mesmo",
      categoria: "Bebidas", // só produtos
    });
    expect(c).toMatchObject({
      tipo: undefined,
      entrega: undefined,
      ordem: "relevancia",
      lat: undefined,
      lng: undefined,
      pagina: 1,
      lista: "todas",
      categoria: undefined,
    });
  });

  it("a lista de favoritas/recentes só existe nas lojas", () => {
    expect(lerConsulta("lojas", { lista: "favoritas" }).lista).toBe("favoritas");
    expect(lerConsulta("produtos", { lista: "favoritas" }).lista).toBe("todas");
  });
});

describe("consultaDaApi", () => {
  it("leva os filtros e a paginação", () => {
    const c = lerConsulta("produtos", { tipo: "APPAREL", busca: "camiseta", pagina: "2" });
    const p = new URLSearchParams(consultaDaApi(c));
    expect(p.get("tipo")).toBe("APPAREL");
    expect(p.get("busca")).toBe("camiseta");
    expect(p.get("pagina")).toBe("2");
    expect(p.get("porPagina")).toBe("24");
    expect(p.get("ordem")).toBe("relevancia");
    expect(p.has("lat")).toBe(false);
  });

  it("'mais perto' sem localização cai para relevância", () => {
    const sem = lerConsulta("lojas", { ordem: "distancia" });
    expect(ordemEfetiva(sem)).toBe("relevancia");
    expect(new URLSearchParams(consultaDaApi(sem)).get("ordem")).toBe("relevancia");

    const com = lerConsulta("lojas", { ordem: "distancia", lat: "-23.5", lng: "-46.6" });
    const p = new URLSearchParams(consultaDaApi(com));
    expect(p.get("ordem")).toBe("distancia");
    expect(p.get("lat")).toBe("-23.5");
    expect(p.get("lng")).toBe("-46.6");
  });
});

describe("enderecoDoFeed", () => {
  const base = lerConsulta("produtos", {
    tipo: "APPAREL",
    busca: "camiseta",
    pagina: "4",
    lat: "-23.5",
    lng: "-46.6",
  });

  it("mudar um filtro volta para a página 1 e mantém o resto", () => {
    expect(enderecoDoFeed(base, { entrega: "entrega" })).toBe(
      "/explorar/produtos?tipo=APPAREL&entrega=entrega&busca=camiseta&lat=-23.5&lng=-46.6",
    );
  });

  it("a paginação mantém os filtros", () => {
    expect(enderecoDoFeed(base, { pagina: 5 })).toContain("pagina=5");
  });

  it("trocar de aba leva os filtros e larga o que não existe lá", () => {
    const c = lerConsulta("produtos", { categoria: "Bebidas", ordem: "preco-menor", tipo: "FOOD_SNACK" });
    expect(enderecoDoFeed(c, { aba: "lojas" })).toBe("/explorar/lojas?tipo=FOOD_SNACK");
  });

  it("sem filtro nenhum, endereço limpo", () => {
    expect(enderecoDoFeed(lerConsulta("lojas", {}))).toBe("/explorar/lojas");
    expect(
      enderecoDoFeed(lerConsulta("lojas", {}), { lista: "favoritas" }),
    ).toBe("/explorar/lojas?lista=favoritas");
  });
});

describe("categoriasDoFeed", () => {
  it("Tudo, Comida (ramos de alimentação juntos) e cada tipo", () => {
    const categorias = categoriasDoFeed([
      { codigo: "FOOD_SNACK", nome: "Lanchonete", alimentacao: true },
      { codigo: "FOOD_ACAI", nome: "Açaiteria", alimentacao: true },
      { codigo: "APPAREL", nome: "Roupas", alimentacao: false },
    ]);
    expect(categorias.map((c) => [c.rotulo, c.tipo])).toEqual([
      ["Tudo", undefined],
      ["Comida", "FOOD_SNACK,FOOD_ACAI"],
      ["Lanchonete", "FOOD_SNACK"],
      ["Açaiteria", "FOOD_ACAI"],
      ["Roupas", "APPAREL"],
    ]);
  });

  it("API fora do ar: só 'Tudo'", () => {
    expect(categoriasDoFeed([])).toEqual([{ rotulo: "Tudo", tipo: undefined }]);
  });
});

describe("filtrarLojasDaConta", () => {
  const lojas = [
    { nome: "Pastelaria da Vila", tipoDeNegocio: "FOOD_SNACK", tipoDeNegocioNome: "Lanchonete", bairro: "Vila Nova", cidade: "São Paulo", formasDeEntrega: ["DELIVERY", "PICKUP"] },
    { nome: "Moda Boa Vista", tipoDeNegocio: "APPAREL", tipoDeNegocioNome: "Roupas", bairro: "Centro", cidade: "São Paulo", formasDeEntrega: ["PICKUP"] },
  ];

  it("filtra por tipo, forma de receber e busca sem acento", () => {
    const nomes = (q: Record<string, string>) =>
      filtrarLojasDaConta(lojas, lerConsulta("lojas", q)).map((l) => l.nome);
    expect(nomes({ tipo: "APPAREL" })).toEqual(["Moda Boa Vista"]);
    expect(nomes({ entrega: "entrega" })).toEqual(["Pastelaria da Vila"]);
    expect(nomes({ busca: "sao paulo" })).toHaveLength(2);
    expect(nomes({ busca: "vila nova" })).toEqual(["Pastelaria da Vila"]);
  });
});

describe("textos", () => {
  it("distância", () => {
    expect(escreverDistancia(null)).toBeNull();
    expect(escreverDistancia(0.43)).toBe("400 m");
    expect(escreverDistancia(0.02)).toBe("100 m");
    expect(escreverDistancia(6.4)).toBe("6,4 km");
  });

  it("formas de receber", () => {
    expect(escreverFormas(["DELIVERY", "PICKUP"])).toBe("Entrega e retirada");
    expect(escreverFormas(["PICKUP"])).toBe("Retirada");
    expect(escreverFormas([])).toBeNull();
  });

  it("total de páginas", () => {
    expect(totalDePaginas(0, 24)).toBe(1);
    expect(totalDePaginas(25, 24)).toBe(2);
  });
});
