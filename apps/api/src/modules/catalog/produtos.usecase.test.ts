import { describe, expect, it } from "vitest";

import {
  criarProduto,
  duplicarProduto,
  editarProduto,
  produtoVisivelNaVitrine,
  removerProduto,
} from "./produtos.usecase.ts";

const agora = new Date("2026-09-21T12:00:00.000Z");

function produtoPublicado() {
  return criarProduto({
    id: "produto-1",
    nome: "Pastel de queijo",
    descricao: "Massa crocante e queijo derretido.",
    categoriaId: "categoria-lanches",
    precoCentavos: 1990,
    status: "PUBLISHED",
    disponivel: true,
    imagens: [{ url: "https://cdn.exemplo.test/pastel.jpg", principal: true }],
    agora,
  });
}

describe("ciclo de vida do produto", () => {
  it("@spec:AC-304 cadastra produto completo e visível com preço em centavos", () => {
    const produto = produtoPublicado();

    expect(produto).toMatchObject({
      id: "produto-1",
      nome: "Pastel de queijo",
      categoriaId: "categoria-lanches",
      precoCentavos: 1990,
      status: "PUBLISHED",
      disponivel: true,
    });
    expect(produto.descricao).toContain("queijo");
    expect(produto.imagens).toEqual([
      { url: "https://cdn.exemplo.test/pastel.jpg", principal: true },
    ]);
    expect(produtoVisivelNaVitrine(produto)).toBe(true);
  });

  it("@spec:AC-307 edita, duplica como rascunho e remove sem mudar o id do pedido", () => {
    const original = produtoPublicado();
    const editado = editarProduto(original, {
      nome: "Pastel de queijo especial",
      precoCentavos: 2190,
      agora: new Date("2026-09-21T12:01:00.000Z"),
    });
    const duplicata = duplicarProduto(editado, {
      id: "produto-2",
      agora: new Date("2026-09-21T12:02:00.000Z"),
    });
    const removido = removerProduto(
      editado,
      new Date("2026-09-21T12:03:00.000Z"),
    );
    const pedidoAntigo = { produtoId: editado.id, nome: editado.nome };

    expect(editado).toMatchObject({
      nome: "Pastel de queijo especial",
      precoCentavos: 2190,
      status: "PUBLISHED",
    });
    expect(duplicata).toMatchObject({
      id: "produto-2",
      nome: "Pastel de queijo especial (cópia)",
      descricao: editado.descricao,
      categoriaId: editado.categoriaId,
      precoCentavos: editado.precoCentavos,
      status: "DRAFT",
      disponivel: false,
    });
    expect(duplicata.imagens).toEqual(editado.imagens);
    expect(produtoVisivelNaVitrine(duplicata)).toBe(false);
    expect(removido.removidoEm).not.toBeNull();
    expect(produtoVisivelNaVitrine(removido)).toBe(false);
    expect(pedidoAntigo).toEqual({
      produtoId: "produto-1",
      nome: "Pastel de queijo especial",
    });
  });

  it("@spec:AC-308 mantém rascunho na gestão e fora da vitrine e do endereço público", () => {
    const rascunho = criarProduto({
      id: "produto-rascunho",
      nome: "Produto em montagem",
      categoriaId: "categoria-lanches",
      precoCentavos: 1000,
      status: "DRAFT",
      disponivel: true,
      agora,
    });

    expect(rascunho.status).toBe("DRAFT");
    expect(rascunho.removidoEm).toBeNull();
    expect(produtoVisivelNaVitrine(rascunho)).toBe(false);
  });
});
