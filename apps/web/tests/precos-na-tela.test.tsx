// @vitest-environment jsdom
/**
 * Prova dos preços como a pessoa os vê (AC-309, AC-310, AC-311).
 *
 * A escolha do preço é do servidor — tem prova própria na API e no core. O que
 * se prova AQUI é a tela: que a promoção aparece com o preço base riscado e
 * dito em palavras, e que o preço de atacado que entrou sozinho no carrinho se
 * explica no resumo do fechamento.
 */
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import type { CatalogoDaVitrineNoContrato } from "@simpleclick/contracts";

import { FechamentoDaCompra } from "../src/features/checkout/FechamentoDaCompra";
import { SeloDePreco } from "../src/features/produto/SeloDePreco";
import { CartaoDeProduto } from "../src/features/vitrine/GradeDeProdutos";
import type { ConferenciaNaTela } from "../src/lib/carrinho-do-navegador";
import { centavosDoTexto } from "../src/lib/dinheiro";
import { prepararCatalogo } from "../src/server/catalogo-na-tela";

const LOJA = "pastelaria-do-preco";

/** Texto puro, como um leitor de tela ouviria. */
function comoSeLe(html: string): string {
  const caixa = document.createElement("div");
  caixa.innerHTML = html;
  const partes: string[] = [];
  const caminhante = document.createTreeWalker(caixa, NodeFilter.SHOW_TEXT);
  while (caminhante.nextNode()) {
    const trecho = (caminhante.currentNode.textContent ?? "").trim();
    if (trecho !== "") partes.push(trecho);
  }
  return partes.join(" ").replace(/\s+/g, " ");
}

function catalogoCom(
  precoCentavos: number,
  precoAnteriorCentavos: number | null,
): CatalogoDaVitrineNoContrato {
  return {
    secoes: [
      {
        id: "aaaaaaaa-1111-4111-8111-111111111111",
        apelido: "pasteis",
        nome: "Pastéis",
        produtos: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            apelido: "pastel-de-queijo",
            nome: "Pastel de queijo",
            chamada: null,
            precoCentavos,
            precoAnteriorCentavos,
            imagem: null,
            destaque: false,
            disponivel: true,
          },
        ],
      },
    ],
    destaques: [],
    versao: 1,
    filtros: [],
  } as unknown as CatalogoDaVitrineNoContrato;
}

describe("preço base e promocional na vitrine (AC-309)", () => {
  it("@spec:AC-309 a vitrine mostra R$ 15,00 a pagar e R$ 20,00 riscado ao lado", () => {
    const naTela = prepararCatalogo(catalogoCom(1500, 2000), {
      apelidoDaLoja: LOJA,
    });
    const cartao = naTela.secoes[0]?.produtos[0];
    if (cartao === undefined) throw new Error("o cartão não foi preparado");

    const html = renderToStaticMarkup(<CartaoDeProduto produto={cartao} />);

    expect(html).toContain("<s>R$ 20,00</s>");
    // Em palavras, para quem ouve a página: riscado é só estilo.
    expect(comoSeLe(html)).toContain("De R$ 20,00 por R$ 15,00");
  });

  it("@spec:AC-309 sem promoção, nada aparece riscado", () => {
    const naTela = prepararCatalogo(catalogoCom(2000, null), {
      apelidoDaLoja: LOJA,
    });
    const cartao = naTela.secoes[0]?.produtos[0];
    if (cartao === undefined) throw new Error("o cartão não foi preparado");

    const html = renderToStaticMarkup(<CartaoDeProduto produto={cartao} />);

    expect(html).not.toContain("<s>");
    expect(comoSeLe(html)).toContain("R$ 20,00");
  });

  it("@spec:AC-309 a página do produto conta a promoção do mesmo jeito", () => {
    const lido = comoSeLe(
      renderToStaticMarkup(
        <SeloDePreco preco="R$ 15,00" precoAnterior="R$ 20,00" />,
      ),
    );

    expect(lido).toContain("De R$ 20,00");
    expect(lido).toContain("por R$ 15,00");
  });
});

const CONFERENCIA_COM_ATACADO: ConferenciaNaTela = {
  mudancas: [],
  precisaConfirmar: false,
  itens: [
    {
      itemId: "11111111-1111-4111-8111-111111111111",
      produtoId: "22222222-2222-4222-8222-222222222222",
      nome: "Coxinha",
      quantidade: 6,
      precoUnitarioCentavos: 1500,
      totalDaLinhaCentavos: 9000,
      precoAplicado: {
        rotulo: "Atacado",
        motivo: "Atacado: preço a partir de 6 unidades, e você está levando 6.",
      },
    },
    {
      itemId: "33333333-3333-4333-8333-333333333333",
      produtoId: "44444444-4444-4444-8444-444444444444",
      nome: "Guaraná",
      quantidade: 1,
      precoUnitarioCentavos: 600,
      totalDaLinhaCentavos: 600,
      precoAplicado: null,
    },
  ],
  subtotalCentavos: 9600,
};

async function montarFechamento(conferencia: ConferenciaNaTela) {
  const caixa = document.createElement("div");
  document.body.appendChild(caixa);
  let raiz: Root;
  await act(async () => {
    raiz = createRoot(caixa);
    raiz.render(
      <FechamentoDaCompra
        apelidoDaLoja={LOJA}
        formas={{ aceitaEntrega: false, aceitaRetirada: true }}
        formasDePagamento={["CASH"]}
        pix={null}
        entrega={{
          taxaCentavos: null,
          nomeDaTaxa: null,
          gratisAcimaDeCentavos: null,
          minimoParaEntregaCentavos: null,
        }}
        linkDoCatalogo={`/loja/${LOJA}/cardapio`}
        rotuloDoCatalogo="Cardápio"
        conta={{ nome: "Ana Paula", email: "ana@cliente.test", telefone: "+5511988887777" }}
        conferir={
          vi
            .fn()
            .mockResolvedValue({ estado: "conferido", conferencia }) as never
        }
        fechar={vi.fn() as never}
      />,
    );
  });
  return {
    caixa,
    desmontar: () => {
      act(() => raiz.unmount());
      caixa.remove();
    },
  };
}

describe("o preço de atacado se explica no fechamento (AC-310)", () => {
  it("@spec:AC-310 a linha do item mostra qual preço foi usado e por quê", async () => {
    const { caixa, desmontar } = await montarFechamento(
      CONFERENCIA_COM_ATACADO,
    );

    const linhas = [...caixa.querySelectorAll(".sc-resumo__linha")];
    const daCoxinha = linhas.find((linha) =>
      (linha.textContent ?? "").includes("6× Coxinha"),
    );
    expect(daCoxinha?.textContent).toContain("R$ 90,00");
    expect(daCoxinha?.textContent).toContain(
      "Atacado: preço a partir de 6 unidades",
    );
    desmontar();
  });

  it("@spec:AC-310 item no preço normal não ganha explicação nenhuma", async () => {
    const { caixa, desmontar } = await montarFechamento(
      CONFERENCIA_COM_ATACADO,
    );

    const linhas = [...caixa.querySelectorAll(".sc-resumo__linha")];
    const doGuarana = linhas.find((linha) =>
      (linha.textContent ?? "").includes("1× Guaraná"),
    );
    expect(doGuarana?.querySelector(".sc-resumo__observacao")).toBeNull();
    desmontar();
  });
});

describe("o formulário do painel lê o preço sem perder centavo (AC-311)", () => {
  it("@spec:AC-311 o que o dono digita vira centavos inteiros antes de ir à API", () => {
    expect(centavosDoTexto("19,99")).toBe(1999);
    expect(centavosDoTexto("19.99")).toBe(1999);
    expect(centavosDoTexto("R$ 1.234,56")).toBe(123_456);
    expect(centavosDoTexto("dezenove")).toBeNull();
  });
});
