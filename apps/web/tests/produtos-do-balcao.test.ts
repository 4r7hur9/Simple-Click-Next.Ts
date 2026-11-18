import { describe, expect, it } from "vitest";

import { produtosDoBalcao } from "../src/server/produtos-do-balcao.ts";

const CATALOGO = {
  secoes: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      apelido: "lanches",
      nome: "Lanches",
      produtos: Array.from({ length: 40 }, (_, indice) => ({
        id: `11111111-1111-4111-8111-${String(indice).padStart(12, "0")}`,
        apelido: `produto-${indice}`,
        nome: `Produto ${indice}`,
        chamada: null,
        precoCentavos: 2000,
        precoAnteriorCentavos: null,
        imagem: null,
        destaque: false,
        disponivel: true,
      })),
    },
  ],
  destaques: [],
  versao: "1",
};

describe("catálogo leve do balcão", () => {
  it("abrir o balcão com muitos produtos não pede nenhum detalhe", async () => {
    let pedidosDeDetalhe = 0;
    const buscar: typeof fetch = async (endereco) => {
      if (String(endereco).includes("/produto/")) pedidosDeDetalhe += 1;
      return Response.json(CATALOGO);
    };

    const leitura = await produtosDoBalcao("e2e-painel", buscar);

    expect(leitura.estado).toBe("ok");
    if (leitura.estado !== "ok") return;
    expect(leitura.produtos).toHaveLength(40);
    expect(leitura.produtos[0]).toEqual({
      id: "11111111-1111-4111-8111-000000000000",
      nome: "Produto 0",
      precoCentavos: 2000,
      imagem: null,
      disponivel: true,
    });
    expect(pedidosDeDetalhe).toBe(0);
  });
});
