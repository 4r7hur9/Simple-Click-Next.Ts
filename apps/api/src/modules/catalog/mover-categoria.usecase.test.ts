import { describe, expect, it } from "vitest";

import {
  moverProdutoDeCategoria,
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
