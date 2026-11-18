// @vitest-environment jsdom
/**
 * Card #108 · T-10802 — as categorias viram chips com a contagem de itens.
 */
import { describe, expect, it } from "vitest";

import { AbasDeCategoria } from "../src/features/vitrine/AbasDeCategoria";
import { renderToStaticMarkup } from "react-dom/server";

import {
  RESUMO,
  SECAO_A,
  produto,
  renderizarTela,
} from "./apoio-do-catalogo-na-tela";

function chips(documento: Document) {
  return [
    ...documento.querySelectorAll<HTMLAnchorElement>(
      'nav[aria-label="Categorias"] a.sc-chip',
    ),
  ];
}

describe("as categorias como chips com contagem", () => {
  it("[CA-3] @spec:AC-10805 cada categoria mostra quantos itens tem, e 'Todas' não leva número", async () => {
    const { documento } = await renderizarTela();
    const lista = chips(documento);

    expect(
      lista.map((c) => c.querySelector(".sc-chip__rotulo")?.textContent),
    ).toEqual(["Todas", "Salgados", "Bebidas", "Doces"]);
    expect(lista[0]?.querySelector(".sc-chip__contagem")).toBeNull();
    expect(
      lista
        .slice(1)
        .map((c) => c.querySelector(".sc-chip__contagem")?.textContent),
    ).toEqual(["3 itens", "2 itens", "1 item"]);
  });

  it("[CA-3] @spec:AC-10805 o número visível é só o número; o leitor ouve 'itens'", async () => {
    const { documento } = await renderizarTela();
    const salgados = chips(documento)[1]!;
    const contagem = salgados.querySelector(".sc-chip__contagem")!;
    expect(contagem.firstChild?.textContent).toBe("3");
    expect(contagem.querySelector(".sc-so-leitor")?.textContent).toBe(" itens");
  });

  it("[CA-3] @spec:AC-10805 com busca valendo, a contagem é a dos acertos", async () => {
    const { documento } = await renderizarTela(
      { busca: "pastel" },
      {
        resumo: {
          ...RESUMO,
          secoes: [
            { ...RESUMO.secoes[0]!, total: 1, produtos: [produto(1)] },
            {
              ...RESUMO.secoes[1]!,
              total: 2,
              produtos: [produto(4), produto(5)],
            },
            { ...RESUMO.secoes[2]!, total: 4, produtos: [produto(6)] },
          ],
        },
      },
    );
    const contagens = chips(documento)
      .slice(1)
      .map((c) => c.querySelector(".sc-chip__contagem")?.textContent);
    expect(contagens).toEqual(["1 item", "2 itens", "4 itens"]);
    // O link de cada categoria mantém a busca.
    expect(chips(documento)[1]?.getAttribute("href")).toContain("busca=pastel");
  });

  it("[CA-3] @spec:AC-10805 a categoria em vigor tem aria-current=page e o chip ativo", async () => {
    const { documento } = await renderizarTela({ categoria: "bebidas" });
    const lista = chips(documento);
    const ativos = lista.filter(
      (c) => c.getAttribute("aria-current") === "page",
    );

    expect(ativos).toHaveLength(1);
    expect(ativos[0]?.querySelector(".sc-chip__rotulo")?.textContent).toBe(
      "Bebidas",
    );
    expect(ativos[0]?.classList.contains("sc-chip--ativo")).toBe(true);
    expect(
      lista.filter((c) => c.classList.contains("sc-chip--ativo")),
    ).toHaveLength(1);
  });

  it("[CA-3] @spec:AC-10803 um catálogo pequeno (duas abas ou menos) não mostra a faixa", () => {
    const html = renderToStaticMarkup(
      <AbasDeCategoria
        abas={[
          { nome: "Todas", link: "/x", emVigor: true },
          {
            nome: "Salgados",
            link: "/x?categoria=a",
            emVigor: false,
            total: 3,
          },
        ]}
        filtroEmVigor={null}
      />,
    );
    expect(html).toBe("");
  });

  it("[CA-3] @spec:AC-10811 a faixa continua uma lista de links alcançável pelo Tab", async () => {
    const { documento } = await renderizarTela();
    const nav = documento.querySelector('nav[aria-label="Categorias"]')!;
    expect(nav.querySelector("ul")).not.toBeNull();
    for (const chip of chips(documento)) {
      expect(chip.getAttribute("href")).toMatch(
        /^\/loja\/casa-do-sabor\/cardapio/,
      );
      expect(chip.getAttribute("tabindex")).toBeNull();
    }
  });

  it("[CA-3] @spec:AC-10805 as seções do resumo que a tela usa existem (guarda do apoio)", () => {
    expect(RESUMO.secoes[0]?.id).toBe(SECAO_A);
  });
});
