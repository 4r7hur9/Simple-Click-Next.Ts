// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { lerDaFeature } from "./apoio-painel-lojista.ts";

describe("painel · catálogo", () => {
  it("[CA-1] @spec:AC-11213 a lista de produtos usa a barra de filtros única e a paginação do pacote", () => {
    const lista = lerDaFeature("painel-catalogo/ListaProdutos.tsx");
    expect(lista).toContain("BarraDeFiltros");
    expect(lista).toMatch(/Paginacao|ListaPaginada|lista-paginada/);
  });

  it("[CA-2] @spec:AC-11220 as listas do catálogo não carregam cor literal", () => {
    for (const nome of [
      "painel-catalogo/ListaProdutos.tsx",
      "painel-catalogo/ListaCategorias.tsx",
      "painel-catalogo/FormularioProduto.tsx",
      "painel-estoque/PainelDeEstoque.tsx",
    ]) {
      expect(lerDaFeature(nome), nome).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});
