// @vitest-environment jsdom
/**
 * Card #56 — varejo e atacado juntos no cartão da vitrine, na página do
 * produto e no feed. Sem faixa, nada muda.
 */
import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import type {
  AtacadoDoProdutoNoContrato,
  CatalogoDaVitrineNoContrato,
  ProdutoDoFeed,
  ProdutoNoContrato,
} from "@simpleclick/contracts";

import { CartaoDeProduto } from "../src/features/feed/Cartoes";
import { lerConsulta } from "../src/features/feed/consulta";
import { EscolhasDoProduto } from "../src/features/produto/EscolhasDoProduto";
import { TabelaDoAtacado } from "../src/features/produto/TabelaDoAtacado";
import { GradeDeProdutos } from "../src/features/vitrine/GradeDeProdutos";
import {
  chamadaDoAtacado,
  linhasDoAtacado,
  unitarioNoAtacado,
} from "../src/lib/atacado-na-vitrine";
import { prepararCatalogo } from "../src/server/catalogo-na-tela";
import { prepararProduto } from "../src/server/produto";

const LOJA = "distribuidora";

/** 5% a partir de 10, 10% a partir de 50, sobre R$ 10,00. */
const ATACADO: AtacadoDoProdutoNoContrato = {
  pedidoMinimo: 10,
  faixas: [
    {
      quantidadeMinima: 10,
      tipoDeDesconto: "PERCENTUAL",
      desconto: 5,
      rotulo: "Caixa",
      unitarioCentavos: 950,
      descontoPorUnidadeCentavos: 50,
    },
    {
      quantidadeMinima: 50,
      tipoDeDesconto: "PERCENTUAL",
      desconto: 10,
      rotulo: null,
      unitarioCentavos: 900,
      descontoPorUnidadeCentavos: 100,
    },
  ],
};

const espacos = (texto: string) => texto.replace(/\s+/g, " ");

describe("o texto do atacado", () => {
  it("a chamada do cartão usa o pedido mínimo e o preço da primeira faixa", () => {
    expect(espacos(chamadaDoAtacado(ATACADO) ?? "")).toBe(
      "Atacado a partir de 10 un.: R$ 9,50",
    );
    expect(chamadaDoAtacado(null)).toBeNull();
    expect(chamadaDoAtacado(undefined)).toBeNull();
  });

  it("a tabela traz o varejo e cada faixa com preço e economia", () => {
    const linhas = linhasDoAtacado(ATACADO, 1000).map((l) => ({
      ...l,
      preco: espacos(l.preco),
      economia: l.economia === null ? null : espacos(l.economia),
    }));
    expect(linhas).toEqual([
      expect.objectContaining({
        quantidade: "1 a 9 un.",
        preco: "R$ 10,00",
        economia: null,
        ehVarejo: true,
      }),
      expect.objectContaining({
        quantidade: "A partir de 10 un.",
        rotulo: "Caixa",
        preco: "R$ 9,50",
        economia: "R$ 0,50 por un. (5%)",
      }),
      expect.objectContaining({
        quantidade: "A partir de 50 un.",
        preco: "R$ 9,00",
        economia: "R$ 1,00 por un. (10%)",
      }),
    ]);
    expect(linhasDoAtacado(null, 1000)).toEqual([]);
  });

  it("o unitário é o da maior faixa que a quantidade alcança", () => {
    expect(unitarioNoAtacado(ATACADO, 9)).toBeNull();
    expect(unitarioNoAtacado(ATACADO, 10)).toBe(950);
    expect(unitarioNoAtacado(ATACADO, 49)).toBe(950);
    expect(unitarioNoAtacado(ATACADO, 50)).toBe(900);
  });
});

function produtoDoCatalogo(
  sobrescrita: Partial<CatalogoDaVitrineNoContrato["destaques"][number]> = {},
): CatalogoDaVitrineNoContrato["destaques"][number] {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    apelido: "refri",
    nome: "Refrigerante lata",
    chamada: null,
    precoCentavos: 1000,
    precoAnteriorCentavos: null,
    imagem: null,
    destaque: false,
    disponivel: true,
    ...sobrescrita,
  };
}

describe("o cartão da vitrine", () => {
  function desenhar(
    produtos: CatalogoDaVitrineNoContrato["destaques"],
  ): string {
    const naTela = prepararCatalogo(
      {
        secoes: [
          {
            id: "aaaaaaaa-1111-4111-8111-111111111111",
            apelido: "bebidas",
            nome: "Bebidas",
            produtos,
          },
        ],
        destaques: [],
        versao: "1",
      },
      { apelidoDaLoja: LOJA, categoriaEscolhida: null },
    );
    return espacos(
      renderToStaticMarkup(<GradeDeProdutos secao={naTela.secoes[0]!} />),
    );
  }

  it("mostra o varejo e a linha do atacado juntos", () => {
    const html = desenhar([produtoDoCatalogo({ atacado: ATACADO })]);
    expect(html).toContain("R$ 10,00");
    expect(html).toContain(
      '<span class="sc-vitrine__atacado">Atacado a partir de 10 un.: R$ 9,50</span>',
    );
  });

  it("sem faixa, o cartão fica como era", () => {
    expect(desenhar([produtoDoCatalogo({ atacado: null })])).not.toContain(
      "sc-vitrine__atacado",
    );
    expect(desenhar([produtoDoCatalogo()])).not.toContain("Atacado");
  });
});

const DA_API: ProdutoNoContrato = {
  id: "11111111-1111-4111-8111-111111111111",
  apelido: "refri",
  nome: "Refrigerante lata",
  chamada: null,
  descricao: null,
  imagens: [],
  precoCentavos: 1000,
  precoAnteriorCentavos: null,
  atacado: ATACADO,
  grupos: [],
  variacoes: [],
  disponivel: true,
  motivoIndisponivel: null,
  aceitaObservacao: false,
  secao: null,
};

describe("a página do produto", () => {
  it("a tabela completa marca a linha que vale para a quantidade", () => {
    const html = espacos(
      renderToStaticMarkup(
        <TabelaDoAtacado atacado={ATACADO} varejoCentavos={1000} quantidade={12} />,
      ),
    );
    expect(html).toContain("Preços de atacado");
    expect(html).toContain("1 a 9 un.");
    expect(html).toContain("A partir de 50 un.");
    expect(html).toContain("R$ 1,00 por un. (10%)");
    expect(html).toMatch(
      /sc-atacado__linha--vale" aria-current="true"><th scope="row">A partir de 10 un\./,
    );
  });

  it("sem faixa, a tabela não aparece", () => {
    expect(
      renderToStaticMarkup(
        <TabelaDoAtacado atacado={null} varejoCentavos={1000} quantidade={1} />,
      ),
    ).toBe("");
  });

  it("o total do botão passa ao preço da faixa quando a quantidade chega lá", () => {
    const produto = prepararProduto(DA_API, LOJA, true);
    expect(produto.atacado).toEqual(ATACADO);

    const caixa = document.createElement("div");
    document.body.appendChild(caixa);
    let raiz: Root;
    act(() => {
      raiz = createRoot(caixa);
      raiz.render(
        <EscolhasDoProduto
          produto={produto}
          apelidoDaLoja={LOJA}
          rotulos={{ variacao: "Sabor" }}
        />,
      );
    });
    const total = () =>
      espacos(caixa.querySelector(".sc-produto__adicionar")?.textContent ?? "");
    expect(caixa.querySelector(".sc-atacado")).not.toBeNull();
    expect(total()).toContain("R$ 10,00");

    const mais = caixa.querySelector<HTMLButtonElement>(
      '[aria-label="Aumentar a quantidade"]',
    )!;
    for (let i = 1; i < 10; i++) {
      act(() => {
        mais.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }
    // 10 × R$ 9,50.
    expect(total()).toContain("R$ 95,00");
    expect(
      caixa.querySelector(".sc-atacado__linha--vale th")?.textContent,
    ).toContain("A partir de 10 un.");

    act(() => raiz.unmount());
    caixa.remove();
  });
});

const DO_FEED: ProdutoDoFeed = {
  id: "p1",
  nome: "Refrigerante lata",
  descricao: null,
  precoCentavos: 1000,
  precoOriginalCentavos: null,
  imagem: null,
  categoria: null,
  loja: {
    apelido: LOJA,
    nome: "Distribuidora",
    tipoDeNegocio: "GROCERY",
    logo: null,
    cidade: null,
    bairro: null,
    formasDeEntrega: ["PICKUP"],
  },
  distanciaKm: null,
  publicadoEm: "2026-10-16T10:00:00.000Z",
};

describe("o cartão do feed", () => {
  const desenhar = (produto: ProdutoDoFeed) =>
    espacos(
      renderToStaticMarkup(
        <CartaoDeProduto produto={produto} consulta={lerConsulta("produtos", {})} />,
      ),
    );

  it("mostra o atacado junto do varejo", () => {
    const html = desenhar({ ...DO_FEED, atacado: ATACADO });
    expect(html).toContain("R$ 10,00");
    expect(html).toContain("Atacado a partir de 10 un.: R$ 9,50");
  });

  it("sem faixa, nada muda", () => {
    expect(desenhar({ ...DO_FEED, atacado: null })).not.toContain("Atacado");
  });
});
