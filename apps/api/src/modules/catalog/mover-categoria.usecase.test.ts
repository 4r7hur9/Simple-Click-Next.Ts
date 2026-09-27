import { describe, expect, it } from "vitest";

import {
  moverProdutoDeCategoria,
  planejarTrocaDeCategoria,
  type DefinicaoDeEspecificacao,
  type ValorDeEspecificacao,
} from "./mover-categoria.usecase.ts";

const pneu: DefinicaoDeEspecificacao = {
  id: "def-aro",
  categoriaId: "cat-pneus",
  chave: "aro",
  rotulo: "Aro",
  obrigatoria: true,
};

const largura: DefinicaoDeEspecificacao = {
  id: "def-largura",
  categoriaId: "cat-rodas",
  chave: "largura",
  rotulo: "Largura",
  obrigatoria: true,
};

const valorDoAro: ValorDeEspecificacao = {
  id: "valor-aro",
  produtoId: "produto-1",
  definicaoId: pneu.id,
  categoriaId: pneu.categoriaId,
  valor: 17,
};

describe("mudança de categoria do produto", () => {
  it("@spec:AC-329 preserva valor antigo e oferece especificações novas", () => {
    const resultado = moverProdutoDeCategoria({
      categoriaAtualId: largura.categoriaId,
      valores: [valorDoAro],
      especificacoesDaNovaCategoria: [largura],
    });

    expect(resultado.valoresPreservados).toEqual([
      { ...valorDoAro, usadoNaCategoriaAtual: false },
    ]);
    expect(resultado.especificacoesParaPreencher).toEqual([largura]);
    expect(valorDoAro).toEqual({
      id: "valor-aro",
      produtoId: "produto-1",
      definicaoId: "def-aro",
      categoriaId: "cat-pneus",
      valor: 17,
    });
  });

  it("@spec:AC-329 não duplica preenchimento que já pertence à categoria atual", () => {
    const resultado = moverProdutoDeCategoria({
      categoriaAtualId: pneu.categoriaId,
      valores: [valorDoAro],
      especificacoesDaNovaCategoria: [pneu],
    });

    expect(resultado.valoresPreservados[0]).toEqual({
      ...valorDoAro,
      usadoNaCategoriaAtual: true,
    });
    expect(resultado.especificacoesParaPreencher).toEqual([]);
  });
});

describe("trocar a categoria principal do produto", () => {
  const vinculos = [
    { id: "v-pneus", categoriaId: "cat-pneus", principal: true },
    { id: "v-promocoes", categoriaId: "cat-promocoes", principal: false },
  ];

  it("@spec:AC-329 salvar sem mudar a categoria não mexe em vínculo nenhum", () => {
    expect(planejarTrocaDeCategoria(vinculos, "cat-pneus")).toEqual({
      tipo: "nada",
    });
  });

  it("@spec:AC-329 mover troca só a principal e mantém as seções secundárias", () => {
    expect(planejarTrocaDeCategoria(vinculos, "cat-rodas")).toEqual({
      tipo: "trocar",
      apagar: ["v-pneus"],
      tornarPrincipal: null,
      criarNaCategoria: "cat-rodas",
    });
  });

  it("@spec:AC-329 se o produto já estava na nova como secundária, ela vira a principal", () => {
    expect(planejarTrocaDeCategoria(vinculos, "cat-promocoes")).toEqual({
      tipo: "trocar",
      apagar: ["v-pneus"],
      tornarPrincipal: "v-promocoes",
      criarNaCategoria: null,
    });
  });
});
