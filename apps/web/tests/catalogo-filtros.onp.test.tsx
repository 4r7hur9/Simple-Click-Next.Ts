// @vitest-environment jsdom
/**
 * Card #108 · T-10803 — filtros em gaveta e na barra lateral, com chips dos
 * filtros ligados. O jsdom não troca de largura: a prova é a ESTRUTURA (um só
 * formulário, nenhum id repetido, o painel que abre por `popovertarget`) e os
 * links dos chips. O que cada largura mostra está no CSS (`catalogo-layout`).
 */
import { describe, expect, it } from "vitest";

import { RESUMO, renderizarTela } from "./apoio-do-catalogo-na-tela";

const COM_FILTROS = {
  ...RESUMO,
  filtros: [
    { chave: "tamanho", nome: "Tamanho", valores: ["P", "M", "G"] },
    { chave: "cor", nome: "Cor", valores: ["Azul", "Preto"] },
  ],
};

function chipsAtivos(documento: Document) {
  return [
    ...documento.querySelectorAll<HTMLAnchorElement>(
      ".sc-catalogo__ativos a.sc-chip",
    ),
  ];
}

describe("os filtros ligados como chips", () => {
  it("[CA-4] @spec:AC-10815 mostra um chip por filtro, com nome acessível e o total de itens", async () => {
    const { documento } = await renderizarTela(
      { busca: "camiseta", filtro: ["tamanho=M", "cor=Azul"] },
      { resumo: COM_FILTROS },
    );
    const chips = chipsAtivos(documento);

    expect(chips.map((c) => c.getAttribute("aria-label"))).toEqual([
      "Remover filtro Tamanho: M",
      "Remover filtro Cor: Azul",
    ]);
    expect(chips.map((c) => c.textContent)).toEqual([
      "Tamanho: M",
      "Cor: Azul",
    ]);
    // Sem categoria nem ordem não há página: o total é a soma das seções (3+2+1).
    expect(
      documento.querySelector(".sc-catalogo__encontrados")?.textContent,
    ).toBe("6 itens encontrados");
  });

  it("[CA-4] @spec:AC-10815 acionar um chip remove só aquele filtro", async () => {
    const { documento } = await renderizarTela(
      {
        categoria: "salgados",
        busca: "camiseta",
        atacado: "1",
        ordem: "menor-preco",
        filtro: ["tamanho=M", "cor=Azul"],
      },
      { resumo: COM_FILTROS },
    );
    const [semTamanho, semCor] = chipsAtivos(documento);

    const semM = new URL(semTamanho!.getAttribute("href")!, "http://x");
    expect(semM.pathname).toBe("/loja/casa-do-sabor/cardapio");
    expect(semM.searchParams.getAll("filtro")).toEqual(["cor=Azul"]);
    // Categoria, busca, atacado e ordem ficam como estavam.
    expect(semM.searchParams.get("categoria")).toBe("salgados");
    expect(semM.searchParams.get("busca")).toBe("camiseta");
    expect(semM.searchParams.get("atacado")).toBe("1");
    expect(semM.searchParams.get("ordem")).toBe("menor-preco");

    const semAzul = new URL(semCor!.getAttribute("href")!, "http://x");
    expect(semAzul.searchParams.getAll("filtro")).toEqual(["tamanho=M"]);
  });

  it("[CA-4] @spec:AC-10815 o último chip removido leva ao catálogo sem nenhum filtro", async () => {
    const { documento } = await renderizarTela(
      { filtro: "tamanho=M" },
      { resumo: COM_FILTROS },
    );
    const [unico] = chipsAtivos(documento);
    expect(unico?.getAttribute("href")).toBe("/loja/casa-do-sabor/cardapio");
  });

  it("[CA-4] @spec:AC-10815 sem filtro ligado o bloco dos chips não existe", async () => {
    const { documento } = await renderizarTela({}, { resumo: COM_FILTROS });
    expect(documento.querySelector(".sc-catalogo__ativos")).toBeNull();
  });

  it("[CA-4] @spec:AC-10815 valor sim/não é lido em português no chip", async () => {
    const { documento } = await renderizarTela(
      { filtro: "organico=true" },
      {
        resumo: {
          ...RESUMO,
          filtros: [
            { chave: "organico", nome: "Orgânico", valores: ["true", "false"] },
          ],
        },
      },
    );
    expect(chipsAtivos(documento)[0]?.textContent).toBe("Orgânico: Sim");
  });
});

describe("um só formulário de filtros", () => {
  it("[CA-4] @spec:AC-10813 existe um só formulário de filtros e nenhum id se repete", async () => {
    const { documento } = await renderizarTela(
      { filtro: "tamanho=M" },
      { resumo: COM_FILTROS },
    );
    expect(
      documento.querySelectorAll(
        'form[aria-label="Filtrar por especificação"]',
      ),
    ).toHaveLength(1);

    const ids = [...documento.querySelectorAll("[id]")].map((e) => e.id);
    const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(repetidos).toEqual([]);
  });

  it("[CA-4] @spec:AC-10813 o formulário fica dentro da barra, no painel dos ajustes", async () => {
    const { documento } = await renderizarTela({}, { resumo: COM_FILTROS });
    const painel = documento.querySelector(
      ".sc-catalogo-barra #painel-dos-ajustes",
    );
    expect(painel).not.toBeNull();
    expect(painel?.querySelector("form")?.getAttribute("method")).toBe("get");
  });
});

describe("a gaveta de filtros", () => {
  it("[CA-4] @spec:AC-10812 o botão Filtrar abre o painel pelo popover, sem script", async () => {
    const { documento } = await renderizarTela({}, { resumo: COM_FILTROS });
    const botoes = [
      ...documento.querySelectorAll<HTMLButtonElement>(
        'button[popovertarget="painel-dos-ajustes"]',
      ),
    ];
    expect(botoes.length).toBeGreaterThan(0);

    const painel = documento.getElementById("painel-dos-ajustes")!;
    expect(painel.getAttribute("popover")).toBe("auto"); // Esc fecha e o foco volta ao botão
    expect(painel.getAttribute("role")).toBe("dialog");
    expect(painel.getAttribute("aria-labelledby")).toBe("titulo-dos-ajustes");
    expect(documento.getElementById("titulo-dos-ajustes")).not.toBeNull();
  });

  it("[CA-4] @spec:AC-10812 a gaveta traz Aplicar filtros e, com filtro ligado, Limpar filtros", async () => {
    const ligado = await renderizarTela(
      { filtro: "tamanho=M" },
      { resumo: COM_FILTROS },
    );
    const painel = ligado.documento.getElementById("painel-dos-ajustes")!;
    expect(painel.textContent).toContain("Aplicar filtros");
    expect(painel.textContent).toContain("Limpar filtros");

    const desligado = await renderizarTela({}, { resumo: COM_FILTROS });
    const semLimpar = desligado.documento.getElementById("painel-dos-ajustes")!;
    expect(semLimpar.textContent).toContain("Aplicar filtros");
    expect(semLimpar.textContent).not.toContain("Limpar filtros");
  });

  it("[CA-4] @spec:AC-10812 o painel tem um botão de fechar que devolve o foco a quem o abriu", async () => {
    const { documento } = await renderizarTela({}, { resumo: COM_FILTROS });
    const fechar = documento.querySelector(
      '#painel-dos-ajustes button[popovertargetaction="hide"]',
    );
    expect(fechar?.getAttribute("popovertarget")).toBe("painel-dos-ajustes");
    expect(fechar?.getAttribute("aria-label")).toBe("Fechar");
  });
});

describe("a ordem e a troca de categoria", () => {
  it("[CA-4] @spec:AC-10816 as quatro ordens de hoje continuam (e as duas novas entram), cada uma com o link que a aplica", async () => {
    const { documento } = await renderizarTela({}, { resumo: COM_FILTROS });
    const ordens = [
      ...documento.querySelectorAll<HTMLAnchorElement>(
        "#painel-da-ordem .sc-catalogo-barra__ordem",
      ),
    ];
    expect(ordens.map((o) => o.textContent?.trim())).toEqual([
      "Destaques primeiro",
      "Menor preço",
      "Maior preço",
      "Nome, de A a Z",
      "Maior desconto no atacado",
      "Lançamentos",
    ]);
    expect(ordens[1]?.getAttribute("href")).toContain("ordem=menor-preco");
  });

  it("[CA-4] @spec:AC-10817 trocar de categoria descarta os filtros e mantém busca e atacado", async () => {
    const { documento } = await renderizarTela(
      { busca: "camiseta", atacado: "1", filtro: ["tamanho=M"] },
      { resumo: COM_FILTROS },
    );
    const abas = [
      ...documento.querySelectorAll<HTMLAnchorElement>(
        'nav[aria-label="Categorias"] a.sc-chip',
      ),
    ];
    expect(abas.length).toBeGreaterThan(1);
    for (const aba of abas) {
      const url = new URL(aba.getAttribute("href")!, "http://x");
      expect(url.searchParams.getAll("filtro")).toEqual([]);
      expect(url.searchParams.get("busca")).toBe("camiseta");
      expect(url.searchParams.get("atacado")).toBe("1");
    }
  });
});
