import { describe, expect, it } from "vitest";

import {
  precificarItensDoPedidoManual,
  type ProdutoParaPedidoManual,
} from "./pedido-manual.usecase.ts";

const LANCHE: ProdutoParaPedidoManual = {
  id: "11111111-1111-4111-8111-111111111111",
  nome: "X-Salada",
  precoCentavos: 2000,
  disponivel: true,
  grupos: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      nome: "Molho",
      minimo: 1,
      maximo: 1,
      permiteRepetir: false,
      eixoDeVariacao: false,
      opcoes: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          nome: "Ketchup",
          acrescimoCentavos: 0,
          disponivel: true,
        },
        {
          id: "44444444-4444-4444-8444-444444444444",
          nome: "Mostarda",
          acrescimoCentavos: 150,
          disponivel: true,
        },
      ],
    },
  ],
  variacoes: [],
};

const [MOLHO] = LANCHE.grupos;
const MOSTARDA = MOLHO?.opcoes[1];

function catalogo(
  ...produtos: ProdutoParaPedidoManual[]
): Map<string, ProdutoParaPedidoManual | null> {
  return new Map(produtos.map((p) => [p.id, p]));
}

describe("o pedido manual é precificado pelo servidor (AC-707)", () => {
  it("@spec:AC-707 o total vem do catálogo, com o acréscimo da escolha, e os nomes vêm do catálogo", () => {
    const resultado = precificarItensDoPedidoManual(
      [
        {
          produtoId: LANCHE.id,
          quantidade: 2,
          escolhas: [
            {
              grupoId: MOLHO?.id ?? "",
              opcaoId: MOSTARDA?.id ?? "",
              quantidade: 1,
            },
          ],
          observacao: "  sem cebola ",
        },
      ],
      catalogo(LANCHE),
    );

    expect(resultado.pendencias).toEqual([]);
    expect(resultado.subtotalEmCentavos).toBe(2 * 2150);
    expect(resultado.itens[0]).toMatchObject({
      nomeDoProduto: "X-Salada",
      precoUnitarioEmCentavos: 2150,
      opcoesEmCentavos: 150,
      totalDaLinhaEmCentavos: 4300,
      observacao: "sem cebola",
      opcoes: [{ nomeDoGrupo: "Molho", nomeDaOpcao: "Mostarda" }],
    });
  });
});

describe("o pedido manual respeita as regras do catálogo (AC-708)", () => {
  it("@spec:AC-708 grupo obrigatório sem escolha vira pendência apontando o grupo", () => {
    const resultado = precificarItensDoPedidoManual(
      [{ produtoId: LANCHE.id, quantidade: 1, escolhas: [] }],
      catalogo(LANCHE),
    );
    expect(resultado.itens).toEqual([]);
    expect(resultado.pendencias).toEqual([
      {
        produtoId: LANCHE.id,
        produto: "X-Salada",
        grupoId: MOLHO?.id,
        grupo: "Molho",
        motivo: "FALTA_ESCOLHER",
        explicacao: "Escolha 1 opção em Molho.",
      },
    ]);
  });

  it("@spec:AC-708 produto fora do catálogo, esgotado ou sem preço não segue, e todas as pendências aparecem juntas", () => {
    const esgotado: ProdutoParaPedidoManual = {
      ...LANCHE,
      id: "55555555-5555-4555-8555-555555555555",
      nome: "Esgotado",
      disponivel: false,
    };
    const semPreco: ProdutoParaPedidoManual = {
      ...LANCHE,
      id: "66666666-6666-4666-8666-666666666666",
      nome: "Sem preço",
      precoCentavos: null,
      grupos: [],
    };
    const resultado = precificarItensDoPedidoManual(
      [
        {
          produtoId: "77777777-7777-4777-8777-777777777777",
          quantidade: 1,
          escolhas: [],
        },
        { produtoId: esgotado.id, quantidade: 1, escolhas: [] },
        { produtoId: semPreco.id, quantidade: 1, escolhas: [] },
      ],
      catalogo(esgotado, semPreco),
    );
    expect(resultado.pendencias.map((p) => p.motivo)).toEqual([
      "FORA_DO_CATALOGO",
      "INDISPONIVEL",
      "SEM_PRECO",
    ]);
    expect(resultado.subtotalEmCentavos).toBe(0);
  });

  it("@spec:AC-708 com variações, a variação indisponível barra e a disponível dá o preço", () => {
    const camiseta: ProdutoParaPedidoManual = {
      id: "88888888-8888-4888-8888-888888888888",
      nome: "Camiseta",
      precoCentavos: null,
      disponivel: true,
      grupos: [],
      variacoes: [
        {
          id: "99999999-9999-4999-8999-999999999991",
          nome: "P",
          precoCentavos: 4900,
          disponivel: false,
          padrao: true,
        },
        {
          id: "99999999-9999-4999-8999-999999999992",
          nome: "G",
          precoCentavos: 5900,
          disponivel: true,
          padrao: false,
        },
      ],
    };
    const semVariacao = precificarItensDoPedidoManual(
      [{ produtoId: camiseta.id, quantidade: 1, escolhas: [] }],
      catalogo(camiseta),
    );
    // Sem variação escolhida vale a padrão — e a padrão acabou.
    expect(semVariacao.pendencias[0]?.motivo).toBe("VARIACAO_INDISPONIVEL");

    const grande = precificarItensDoPedidoManual(
      [
        {
          produtoId: camiseta.id,
          variacaoId: "99999999-9999-4999-8999-999999999992",
          quantidade: 2,
          escolhas: [],
        },
      ],
      catalogo(camiseta),
    );
    expect(grande.itens[0]).toMatchObject({
      nomeDaVariacao: "G",
      totalDaLinhaEmCentavos: 11800,
    });
  });
});
