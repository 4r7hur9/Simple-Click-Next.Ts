// @vitest-environment jsdom
/**
 * Card #108 · T-10806 — o que a tela diz quando não há resultado.
 *
 * Cada vazio tem a sua frase e a sua saída: busca sem resultado, filtro sem
 * acerto, atacado sem acerto, categoria que não existe mais e loja sem
 * catálogo. O erro que esta tarefa corrige: um filtro de especificação sem
 * acerto caía em "O catálogo está sendo montado" e a barra sumia, sem como
 * desfazer o filtro.
 */
import { describe, expect, it } from "vitest";

import {
  RESUMO,
  SECAO_A,
  produto,
  renderizarTela,
} from "./apoio-do-catalogo-na-tela";

const SEM_SECAO = {
  versao: "1",
  secoes: [],
  destaques: [],
  filtros: [{ chave: "tamanho", nome: "Tamanho", valores: ["P", "M", "XG"] }],
  atacado: { produtos: 0, menorPedidoMinimo: null },
};

function texto(documento: Document): string {
  return documento.querySelector(".sc-catalogo__produtos")?.textContent ?? "";
}

describe("filtro de especificação sem acerto", () => {
  it("[CA-6] @spec:AC-10824 diz que nenhum produto tem o filtro, mantém a barra e oferece Limpar filtros", async () => {
    const { documento } = await renderizarTela(
      { filtro: ["tamanho=XG"] },
      { resumo: SEM_SECAO },
    );

    expect(texto(documento)).toContain("Nenhum produto com esse filtro");
    expect(texto(documento)).not.toContain("está sendo montado");
    expect(texto(documento)).not.toContain("não existe mais");

    // A barra continua, com o formulário para desmarcar.
    expect(documento.querySelector(".sc-catalogo-barra")).not.toBeNull();
    expect(
      documento.querySelector('form[aria-label="Filtrar por especificação"]'),
    ).not.toBeNull();

    const limpar = [...documento.querySelectorAll("a")].find(
      (a) =>
        a.textContent?.trim() === "Limpar filtros" &&
        a.closest(".sc-catalogo__produtos"),
    );
    expect(limpar?.getAttribute("href")).toBe("/loja/casa-do-sabor/cardapio");
  });

  it("[CA-6] @spec:AC-10824 o link Limpar filtros mantém categoria, ordem e atacado", async () => {
    const { documento } = await renderizarTela(
      {
        categoria: "salgados",
        ordem: "menor-preco",
        atacado: "1",
        filtro: ["tamanho=XG"],
      },
      { resumo: SEM_SECAO },
    );
    const limpar = [...documento.querySelectorAll<HTMLAnchorElement>("a")].find(
      (a) =>
        a.textContent?.trim() === "Limpar filtros" &&
        a.closest(".sc-catalogo__produtos"),
    )!;
    const url = new URL(limpar.getAttribute("href")!, "http://x");
    expect(url.searchParams.get("categoria")).toBe("salgados");
    expect(url.searchParams.get("ordem")).toBe("menor-preco");
    expect(url.searchParams.get("atacado")).toBe("1");
    expect(url.searchParams.getAll("filtro")).toEqual([]);
  });

  it("[CA-6] @spec:AC-10824 com categoria escolhida, o filtro sem acerto não vira 'categoria não existe mais'", async () => {
    const { documento } = await renderizarTela(
      { categoria: "salgados", filtro: ["tamanho=XG"] },
      {
        // A API tirou a seção "salgados" (sem acerto) e deixou só as outras.
        resumo: {
          ...RESUMO,
          secoes: [RESUMO.secoes[1]!],
          filtros: SEM_SECAO.filtros,
        },
        pagina: { versao: "1", produtos: [], total: 0, proximoCursor: null },
      },
    );
    expect(texto(documento)).toContain("Nenhum produto com esse filtro");
    expect(texto(documento)).not.toContain("não existe mais");
  });

  it("[CA-6] @spec:AC-10824 com o atacado também ligado, a culpa é do filtro, e não 'sem preço de atacado'", async () => {
    const { documento } = await renderizarTela(
      { atacado: "1", filtro: ["tamanho=XG"] },
      { resumo: SEM_SECAO },
    );
    expect(texto(documento)).toContain("Nenhum produto com esse filtro");
    expect(texto(documento)).not.toContain("preço de atacado");
  });

  it("[CA-6] @spec:AC-10824 o chip do filtro continua para remover só ele", async () => {
    const { documento } = await renderizarTela(
      { filtro: ["tamanho=XG"] },
      { resumo: SEM_SECAO },
    );
    expect(
      documento.querySelector('a[aria-label="Remover filtro Tamanho: XG"]'),
    ).not.toBeNull();
  });
});

describe("busca sem resultado", () => {
  it("[CA-6] @spec:AC-10823 diz o que buscou, mantém o campo preenchido e oferece sair", async () => {
    const { documento } = await renderizarTela(
      { busca: "zzzz" },
      { resumo: { ...SEM_SECAO, filtros: [] } },
    );
    expect(texto(documento)).toContain("Nada encontrado para zzzz");

    const campo = documento.querySelector<HTMLInputElement>(
      'form[role="search"] input[type="search"]',
    );
    expect(campo?.getAttribute("value")).toBe("zzzz");

    const sair = [...documento.querySelectorAll<HTMLAnchorElement>("a")].find(
      (a) => a.textContent?.trim() === "Limpar a busca",
    );
    // Volta ao catálogo inteiro: sem busca, categoria, filtros nem atacado.
    expect(sair?.getAttribute("href")).toBe("/loja/casa-do-sabor/cardapio");
  });
});

describe("atacado sem acerto e loja sem catálogo", () => {
  it("[CA-6] @spec:AC-10824 atacado ligado, sem filtro e sem produto, continua dizendo 'nenhum produto com preço de atacado'", async () => {
    const { documento } = await renderizarTela(
      { atacado: "1" },
      { resumo: { ...SEM_SECAO, filtros: [] } },
    );
    expect(texto(documento)).toContain("Nenhum produto com preço de atacado");
  });

  it("[CA-6] @spec:AC-10824 loja sem nenhum produto continua 'está sendo montado'", async () => {
    const { documento } = await renderizarTela(
      {},
      { resumo: { ...SEM_SECAO, filtros: [] } },
    );
    expect(texto(documento)).toContain("está sendo montado");
    expect(documento.querySelector(".sc-catalogo-barra")).toBeNull();
  });
});

describe("categoria que não existe mais", () => {
  const resumoDe = (opcoes: Record<string, unknown>) =>
    opcoes["porSecao"] === undefined
      ? // Com categoria no endereço o resumo vem só com as contagens.
        {
          ...RESUMO,
          secoes: RESUMO.secoes.map((s) => ({
            ...s,
            produtos: [],
            proximoCursor: null,
          })),
        }
      : RESUMO;

  it("[CA-6] @spec:AC-10825 não dá 404: explica, oferece o catálogo inteiro e lista os produtos logo abaixo", async () => {
    const { documento, chamadasAoResumo } = await renderizarTela(
      { categoria: "nao-existe" },
      { resumoDe },
    );

    expect(texto(documento)).toContain("Essa categoria não existe mais");
    const inteiro = [
      ...documento.querySelectorAll<HTMLAnchorElement>("a"),
    ].find((a) => a.textContent?.includes("inteiro"));
    expect(inteiro?.getAttribute("href")).toBe("/loja/casa-do-sabor/cardapio");

    // E o catálogo inteiro está listado, com produtos de verdade (não só "Ver mais").
    const cartoes = documento.querySelectorAll(
      ".sc-catalogo__produtos .sc-vitrine__cartao",
    );
    expect(cartoes.length).toBeGreaterThan(0);

    // A segunda leitura do resumo é sem a categoria e com produtos por seção.
    expect(chamadasAoResumo).toHaveLength(2);
    const segunda = chamadasAoResumo[1]?.[1] as Record<string, unknown>;
    expect(segunda["categoria"]).toBeUndefined();
    expect(segunda["porSecao"]).toBe(24);
  });

  it("[CA-6] @spec:AC-10825 uma categoria que existe não paga a segunda leitura", async () => {
    const { chamadasAoResumo } = await renderizarTela({
      categoria: "salgados",
    });
    expect(chamadasAoResumo).toHaveLength(1);
  });

  it("[CA-6] @spec:AC-10825 nenhuma aba fica marcada quando a categoria pedida não existe", async () => {
    const { documento } = await renderizarTela(
      { categoria: "nao-existe" },
      { resumoDe },
    );
    expect(
      documento.querySelectorAll('nav[aria-label="Categorias"] [aria-current]'),
    ).toHaveLength(0);
  });
});

describe("os dados estruturados não publicam um recorte", () => {
  it("[CA-6] @spec:AC-10831 com filtro de especificação ligado não sai o bloco do catálogo inteiro", async () => {
    const com = await renderizarTela({}, {});
    const filtrado = await renderizarTela(
      { filtro: ["tamanho=M"] },
      { resumo: { ...RESUMO, filtros: SEM_SECAO.filtros } },
    );
    expect(com.html).toContain("application/ld+json");
    expect(filtrado.html).not.toContain("application/ld+json");
    // Guardas do apoio: as fixtures existem e a seção A é a primeira.
    expect(RESUMO.secoes[0]?.id).toBe(SECAO_A);
    expect(produto(1).id).toContain("0001");
  });
});
