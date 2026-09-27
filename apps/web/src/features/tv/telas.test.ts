/**
 * Prova das telas do rodízio (AC-925, AC-930).
 */
import { describe, expect, it } from "vitest";

import type { CatalogoDaVitrineNoContrato } from "@simpleclick/contracts";

import { montarTelas, NOME_DOS_DESTAQUES } from "./telas.ts";

function produto(
  sobrescrita: Partial<CatalogoDaVitrineNoContrato["destaques"][number]> = {},
): CatalogoDaVitrineNoContrato["destaques"][number] {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    apelido: "coxinha",
    nome: "Coxinha",
    chamada: "Massa de batata, recheio de frango",
    precoCentavos: 750,
    precoAnteriorCentavos: null,
    imagem: null,
    destaque: false,
    disponivel: true,
    ...sobrescrita,
  };
}

const CATALOGO: CatalogoDaVitrineNoContrato = {
  secoes: [
    {
      id: "aaaaaaaa-1111-4111-8111-111111111111",
      apelido: "salgados",
      nome: "Salgados",
      produtos: [
        produto(),
        produto({
          id: "22222222-2222-4222-8222-222222222222",
          apelido: "empada",
          nome: "Empada",
          precoCentavos: 900,
        }),
        produto({
          id: "33333333-3333-4333-8333-333333333333",
          apelido: "kibe",
          nome: "Kibe",
          precoCentavos: 800,
          disponivel: false,
        }),
      ],
    },
    {
      id: "bbbbbbbb-2222-4222-8222-222222222222",
      apelido: "bebidas",
      nome: "Bebidas",
      produtos: [
        produto({
          id: "44444444-4444-4444-8444-444444444444",
          apelido: "guarana",
          nome: "Guaraná",
          chamada: null,
          precoCentavos: 600,
        }),
      ],
    },
    {
      id: "cccccccc-3333-4333-8333-333333333333",
      apelido: "sobremesas",
      nome: "Sobremesas",
      produtos: [
        produto({
          id: "55555555-5555-4555-8555-555555555555",
          apelido: "pudim",
          nome: "Pudim",
          disponivel: false,
        }),
      ],
    },
  ],
  destaques: [
    produto({
      id: "66666666-6666-4666-8666-666666666666",
      apelido: "pastel",
      nome: "Pastel de feira",
      destaque: true,
      precoCentavos: 1200,
      precoAnteriorCentavos: 1500,
    }),
  ],
  versao: "42",
};

describe("as telas do rodízio (AC-925)", () => {
  it("@spec:AC-925 destaques primeiro, depois cada seção na ordem do dono", () => {
    const telas = montarTelas(CATALOGO, 10);

    expect(telas.map((tela) => tela.secao)).toEqual([
      NOME_DOS_DESTAQUES,
      "Salgados",
      "Bebidas",
    ]);
  });

  it("@spec:AC-925 uma seção maior que a tela vira mais de uma tela, todas com o nome dela", () => {
    const telas = montarTelas(CATALOGO, 1);

    const salgados = telas.filter((tela) => tela.secao === "Salgados");
    expect(salgados).toHaveLength(2);
    expect(salgados.map((tela) => tela.produtos[0]?.nome)).toEqual([
      "Coxinha",
      "Empada",
    ]);
    // As chaves são únicas, porque é por elas que a tela troca de conteúdo.
    expect(new Set(telas.map((tela) => tela.chave)).size).toBe(telas.length);
  });

  it("@spec:AC-925 o preço chega escrito, em reais, e a promoção traz o preço anterior", () => {
    const [destaques] = montarTelas(CATALOGO, 10);

    expect(destaques?.produtos[0]).toMatchObject({
      nome: "Pastel de feira",
      preco: "R$ 12,00",
      precoAnterior: "R$ 15,00",
    });
  });

  it("@spec:AC-925 produto sem preço único fica sem preço, em vez de um valor inventado", () => {
    const semPreco: CatalogoDaVitrineNoContrato = {
      ...CATALOGO,
      destaques: [produto({ precoCentavos: null })],
    };

    expect(montarTelas(semPreco, 10)[0]?.produtos[0]?.preco).toBeNull();
  });

  it("@spec:AC-925 catálogo sem nada disponível não gera tela nenhuma", () => {
    const vazio: CatalogoDaVitrineNoContrato = {
      secoes: [],
      destaques: [],
      versao: "1",
    };

    expect(montarTelas(vazio, 10)).toEqual([]);
  });
});

describe("produto esgotado sai da parede (AC-930)", () => {
  it("@spec:AC-930 o produto indisponível não aparece em tela nenhuma", () => {
    const nomes = montarTelas(CATALOGO, 10).flatMap((tela) =>
      tela.produtos.map((produto) => produto.nome),
    );

    expect(nomes).toContain("Coxinha");
    expect(nomes).not.toContain("Kibe");
    expect(nomes).not.toContain("Pudim");
  });

  it("@spec:AC-930 seção em que tudo esgotou some do rodízio, em vez de ficar vazia na parede", () => {
    const secoes = montarTelas(CATALOGO, 10).map((tela) => tela.secao);

    expect(secoes).not.toContain("Sobremesas");
  });

  it("@spec:AC-930 esgotar um produto muda a divisão das telas, e não deixa um buraco", () => {
    const telas = montarTelas(CATALOGO, 2);
    const salgados = telas.filter((tela) => tela.secao === "Salgados");

    // Dois disponíveis, dois por tela: UMA tela, cheia — o esgotado não
    // ocupa a vaga que ocuparia se fosse riscado.
    expect(salgados).toHaveLength(1);
    expect(salgados[0]?.produtos).toHaveLength(2);
  });
});
